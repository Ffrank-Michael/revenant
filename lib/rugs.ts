// The rug memory: confirmed rugs saved in Walrus Memory (namespace "revenant-rugs"),
// plus a local index for EXACT wallet lookups.
//
// WHY AN INDEX: Walrus recall searches by meaning, not exact text, and we measured that it
// cannot reliably find a specific wallet address. So Walrus stays the real store (one memory
// per confirmed rug), and this file keeps a small map  wallet address -> rugs it appeared in,
// rebuilt from Walrus whenever it is stale. A snapshot file is the safety net if Walrus is down.
//
// Server-side only.

import fs from "node:fs";
import path from "node:path";
import { getMemWal, MEMWAL_SAVE_WAIT_MS } from "./memwal";
import { withRetry } from "./retry";
import { normalizeSuiAddress } from "./sui";
import type { TraceResult, Trail, Warning } from "./trace";
import type { RugMethod, VerifyResult } from "./verify";
import { walletCoinObjects, type CoinObjectRef } from "./coinobjects";

export const RUGS_NAMESPACE = "revenant-rugs";
const MARKER = "REVENANT_RUG_V1";
const SNAPSHOT_FILE = path.join(process.cwd(), "data", "rug-index.snapshot.json");
const REFRESH_AFTER_MS = 5 * 60_000; // rebuild the index from Walrus if older than this

// ---------------------------------------------------------------------------
// What one confirmed rug looks like
// ---------------------------------------------------------------------------
export type RugWallet = {
  address: string;
  role: "creator" | "controller" | "funder" | "relay" | "profit";
  hop: number | null; // 0 = creator, 1.. = real funders, null = relay/profit
};

export type RugCase = {
  v: 1;
  coinType: string;
  symbol: string | null;
  publishedAt: string;
  confirmedAt: string;
  methods: RugMethod[];
  creator: string;
  controller: string | null;
  wallets: RugWallet[]; // every wallet worth remembering (exchanges and very busy wallets are left out)
  suiPutIn: number;
  suiTaken: number;
  netSuiGained: number;
  firstRugAt: string | null;
  evidence: { kind: string; digest: string; at: string; suiAmount: number; coinAmount: number }[];
  // Added later; old memories do not have them.
  confirmedBy?: { by: string; how: string; at: string }; // a human checked it (not just Revenant's own check)
  dex?: string; // the exchange (pool) the liquidity was pulled from, e.g. "Cetus" or "Turbos"
  reviewStatus?: "auto_verified_awaiting_review"; // Revenant's own on-chain check only; no human has confirmed it yet
  coinObjects?: CoinObjectRef[]; // SUI coin objects touched by the pull; a fingerprint for tracking the money
};

export type CaseExtras = Pick<RugCase, "confirmedBy" | "coinObjects" | "reviewStatus" | "dex">;

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 2 });

// Builds the case from a trace and a rug check. Returns null if the check did not say "rugged".
export function buildRugCase(trace: TraceResult, verify: VerifyResult, extras: CaseExtras = {}): RugCase | null {
  if (verify.verdict !== "rugged") return null;

  const wallets = new Map<string, RugWallet>();
  const add = (w: RugWallet) => {
    const key = normalizeSuiAddress(w.address);
    if (!wallets.has(key)) wallets.set(key, { ...w, address: key });
  };
  add({ address: trace.creator.address, role: "creator", hop: 0 });
  if (trace.creator.controller) add({ address: trace.creator.controller, role: "controller", hop: 0 });
  const addTrail = (t: Trail | null) => {
    for (const w of t?.wallets ?? []) {
      if (w.role === "creator" || w.exchange || w.isBusy) continue; // exchanges/busy wallets would match everyone
      add({ address: w.address, role: w.isRelay ? "relay" : "funder", hop: w.hop });
    }
  };
  addTrail(trace.trail);
  addTrail(trace.controllerTrail);
  for (const p of verify.profitDestinations) add({ address: p.address, role: "profit", hop: null });

  return {
    v: 1,
    coinType: verify.coin.type,
    symbol: verify.coin.symbol,
    publishedAt: verify.publishedAt,
    confirmedAt: new Date().toISOString(),
    methods: verify.methods,
    creator: verify.creator,
    controller: verify.controller,
    wallets: [...wallets.values()],
    suiPutIn: verify.numbers.liquidityAddedSui + verify.numbers.suiSpentBuying,
    suiTaken: verify.numbers.totalSuiTaken,
    netSuiGained: verify.numbers.netSuiGained,
    firstRugAt: verify.firstRugAt,
    evidence: verify.evidence.map((e) => ({ kind: e.kind, digest: e.digest, at: e.at, suiAmount: e.suiAmount, coinAmount: e.coinAmount })),
    ...(extras.confirmedBy ? { confirmedBy: extras.confirmedBy } : {}),
    ...(extras.reviewStatus ? { reviewStatus: extras.reviewStatus } : {}),
    ...(extras.dex ? { dex: extras.dex } : {}),
    ...(extras.coinObjects?.length ? { coinObjects: extras.coinObjects } : {}),
  };
}

// The text stored in Walrus: a plain sentence first (for meaning-based search), then the data.
export function rugCaseToMemoryText(c: RugCase): string {
  const how = c.methods.map((m) => (m === "creator_dump" ? "the creator dumped the supply" : "the creator pulled the liquidity")).join(" and ");
  const proof = c.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest.slice(0, 12) + "…").join(", ");
  const relays = c.wallets.filter((w) => w.role === "relay").length;
  const sentence =
    `${c.reviewStatus ? "AUTO-VERIFIED RUG, awaiting investigator review (Revenant's own on-chain check, no human confirmation yet)" : "CONFIRMED RUG"}: Sui coin ${c.symbol ?? "unknown"} (${c.coinType}), published ${c.publishedAt.slice(0, 10)} by creator ${c.creator}, rugged: ${how}. ` +
    `The creator put in ${fmt(c.suiPutIn)} SUI and took out ${fmt(c.suiTaken)} SUI (net ${fmt(c.netSuiGained)} SUI). ` +
    `${c.dex ? `The liquidity was pulled from ${c.dex}. ` : ""}` +
    `${relays ? `Its funding passed through ${relays} relay wallets. ` : ""}${proof ? `Proof transactions: ${proof}. ` : ""}` +
    `${c.confirmedBy ? `Confirmed by ${c.confirmedBy.by} (${c.confirmedBy.how}) on ${c.confirmedBy.at.slice(0, 10)}. ` : ""}` +
    `${c.coinObjects?.length ? `${c.coinObjects.length} SUI coin objects from the pull are recorded as a fingerprint. ` : ""}` +
    `Remember these wallets: ${c.wallets.length} wallets are linked to this rug.`;
  return `${sentence}\n${MARKER} ${JSON.stringify(c)}`;
}

export function parseRugMemory(text: string): RugCase | null {
  const i = text.indexOf(MARKER + " ");
  if (i < 0) return null;
  try {
    const c = JSON.parse(text.slice(i + MARKER.length + 1)) as RugCase;
    return c.v === 1 && c.coinType && Array.isArray(c.wallets) ? c : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The local index
// ---------------------------------------------------------------------------
export type IndexStatus = "fresh" | "stale_snapshot" | "partial" | "unavailable";

type IndexState = {
  cases: Map<string, RugCase>; // by coin type
  byWallet: Map<string, { coinType: string; role: RugWallet["role"]; hop: number | null }[]>;
  byCoinObject: Map<string, { coinType: string; role: CoinObjectRef["role"]; digest: string }[]>;
  listedCount: number | null; // how many memories Walrus said the namespace holds
  loadedAt: number; // when the index was last rebuilt from Walrus (0 = never)
  status: IndexStatus;
  note: string;
  refreshing: Promise<void> | null;
};

const g = globalThis as unknown as { __rugIndex?: IndexState };
function state(): IndexState {
  // A dev server that reloaded this file keeps the OLD index object in memory. If it lacks a newer
  // part, rebuild it instead of crashing (this is what broke the first trace after the last update).
  if (g.__rugIndex && !(g.__rugIndex.byCoinObject instanceof Map)) {
    g.__rugIndex.byCoinObject = new Map();
    setCases(g.__rugIndex, [...g.__rugIndex.cases.values()]);
  }
  if (!g.__rugIndex) g.__rugIndex = { cases: new Map(), byWallet: new Map(), byCoinObject: new Map(), listedCount: null, loadedAt: 0, status: "unavailable", note: "not loaded yet", refreshing: null };
  return g.__rugIndex;
}

function setCases(s: IndexState, cases: RugCase[]) {
  s.cases = new Map();
  for (const c of cases) {
    const old = s.cases.get(c.coinType);
    if (!old || old.confirmedAt < c.confirmedAt) s.cases.set(c.coinType, c);
  }
  s.byWallet = new Map();
  for (const c of s.cases.values()) {
    for (const w of c.wallets) {
      const list = s.byWallet.get(w.address) ?? [];
      list.push({ coinType: c.coinType, role: w.role, hop: w.hop });
      s.byWallet.set(w.address, list);
    }
  }
  s.byCoinObject = new Map();
  for (const c of s.cases.values()) {
    for (const o of c.coinObjects ?? []) {
      const list = s.byCoinObject.get(o.id) ?? [];
      list.push({ coinType: c.coinType, role: o.role, digest: o.digest });
      s.byCoinObject.set(o.id, list);
    }
  }
}

function writeSnapshot(s: IndexState) {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ savedAt: new Date().toISOString(), listedCount: s.listedCount, cases: [...s.cases.values()] }, null, 1));
  } catch (e) {
    console.warn("[rugs] could not write snapshot:", e instanceof Error ? e.message : e);
  }
}

function readSnapshot(): RugCase[] {
  try {
    return (JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")).cases ?? []) as RugCase[];
  } catch {
    return [];
  }
}

// Rebuilds the index from Walrus. Falls back to the snapshot file if Walrus cannot be reached.
export async function refreshRugIndex(): Promise<void> {
  const s = state();
  if (s.refreshing) return s.refreshing;
  s.refreshing = (async () => {
    try {
      const m = getMemWal(RUGS_NAMESPACE);
      const listed = await withRetry("list rugs", () => m.listMemories({ namespace: RUGS_NAMESPACE, limit: 500 }));
      const recalled = await withRetry("recall rugs", () =>
        m.recall({ query: "CONFIRMED RUG REVENANT_RUG_V1", namespace: RUGS_NAMESPACE, limit: 1000, sort: "recent" }),
      );
      const cases = recalled.results.map((r) => parseRugMemory(r.text)).filter((c): c is RugCase => c !== null);
      // Walrus told us how many memories exist; if recall returned fewer, say so.
      const complete = recalled.results.length >= listed.memories.length;
      // Never let a short/partial answer wipe out cases we already know from the snapshot.
      const merged = complete ? cases : [...readSnapshot(), ...cases];
      setCases(s, merged);
      s.listedCount = listed.memories.length;
      s.loadedAt = Date.now();
      s.status = complete ? "fresh" : "partial";
      s.note = complete
        ? `${s.cases.size} confirmed rugs loaded from Walrus.`
        : `Walrus listed ${listed.memories.length} memories but recall returned ${recalled.results.length}; merged with the snapshot.`;
      writeSnapshot(s);
    } catch (e) {
      console.warn("[rugs] could not load the rugs from Walrus:", e);
      const snap = readSnapshot();
      if (s.cases.size === 0) setCases(s, snap);
      s.loadedAt = Date.now() - REFRESH_AFTER_MS + 60_000; // try Walrus again in a minute
      s.status = s.cases.size > 0 ? "stale_snapshot" : "unavailable";
      s.note = `Walrus could not be reached (${e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : e}); using ${s.cases.size} cases from the snapshot file.`;
    } finally {
      s.refreshing = null;
    }
  })();
  return s.refreshing;
}

// For the website: the rugs in memory, loaded the same safe way a trace loads them.
export async function loadRugIndex(): Promise<{ cases: RugCase[]; status: IndexStatus; note: string; listedCount: number | null }> {
  const s = await ensureIndex();
  let listedCount = s.listedCount;
  if (listedCount === null) {
    try { listedCount = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")).listedCount ?? null; } catch { /* no snapshot yet */ }
  }
  return { cases: [...s.cases.values()], status: s.status, note: s.note, listedCount };
}

// Makes sure the index is loaded. First load waits; later loads serve the cache and refresh in the background.
const FIRST_LOAD_WAIT_MS = 15_000; // a trace never waits longer than this for Walrus to load the index

async function ensureIndex(): Promise<IndexState> {
  const s = state();
  if (s.loadedAt === 0) {
    const loading = refreshRugIndex();
    const done = await Promise.race([loading.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), FIRST_LOAD_WAIT_MS))]);
    if (!done) {
      // Walrus is slow: answer from the snapshot file now; the load keeps going in the background.
      if (s.cases.size === 0) setCases(s, readSnapshot());
      s.status = s.cases.size > 0 ? "stale_snapshot" : "unavailable";
      s.loadedAt = Date.now() - REFRESH_AFTER_MS + 30_000; // serve the snapshot to the next requests without waiting again
      s.note = `Walrus did not answer within ${FIRST_LOAD_WAIT_MS / 1000}s; using ${s.cases.size} cases from the snapshot file. The load continues in the background.`;
      console.warn(`[rugs] ${s.note}`);
    }
  } else if (Date.now() - s.loadedAt > REFRESH_AFTER_MS) void refreshRugIndex();
  return s;
}

// ---------------------------------------------------------------------------
// Saving a confirmed rug
// ---------------------------------------------------------------------------
// A coin already in memory is skipped, unless replace is true: then a NEW version is saved
// (Walrus keeps the old one; the index uses the version with the latest confirmedAt).
export async function saveRugCase(c: RugCase, opts: { replace?: boolean } = {}): Promise<{ status: "saved" | "already_known"; blobId?: string }> {
  const s = await ensureIndex();
  if (s.cases.has(c.coinType) && !opts.replace) return { status: "already_known" };
  const m = getMemWal(RUGS_NAMESPACE);
  const saved = await withRetry("save rug", () =>
    m.rememberAndWait(rugCaseToMemoryText(c), RUGS_NAMESPACE, { timeoutMs: MEMWAL_SAVE_WAIT_MS }),
  );
  setCases(s, [...s.cases.values(), c]); // the new rug is usable straight away
  writeSnapshot(s);
  return { status: "saved", blobId: saved.blob_id };
}

// ---------------------------------------------------------------------------
// Checking a trace against past rugs
// ---------------------------------------------------------------------------
export type RugMatch = {
  address: string;
  foundIn: "creator trail" | "controller trail";
  roleInThisTrace: string; // "creator", "hop 1 funder", "relay wallet"
  pastRugs: { coinType: string; symbol: string | null; roleInThatRug: string; confirmedAt: string }[];
};

// The strongest signal: the very same SUI coin object (same ID) was in a past rug's pull
// and is now in this token creator's wallet. Money that moved whole keeps its ID.
export type CoinObjectMatch = {
  objectId: string;
  heldBy: string; // which wallet of this token: creator or controller
  how: "holds now" | "seen in a transaction";
  pastRug: { coinType: string; symbol: string | null; role: string; digest: string };
};

export type TraceWithMemory = TraceResult & {
  rugMatches: RugMatch[];
  coinObjectMatches: CoinObjectMatch[];
  coinObjectCheck: { checked: number; note: string }; // how many coin objects of the creator were compared
  alreadyConfirmedRug: boolean; // this very coin is in the memory
  memory: { status: IndexStatus; rugsKnown: number; note: string };
};

export async function addRugMemory(trace: TraceResult): Promise<TraceWithMemory> {
  const s = await ensureIndex();
  const matches: RugMatch[] = [];
  const own = trace.coin.type;

  const scan = (t: Trail | null, foundIn: RugMatch["foundIn"]) => {
    for (const w of t?.wallets ?? []) {
      const hits = (s.byWallet.get(normalizeSuiAddress(w.address)) ?? []).filter((h) => h.coinType !== own);
      if (!hits.length) continue;
      matches.push({
        address: w.address,
        foundIn,
        roleInThisTrace: w.role === "creator" ? "creator" : w.isRelay ? "relay wallet" : `hop ${w.hop} funder`,
        pastRugs: hits.map((h) => ({
          coinType: h.coinType,
          symbol: s.cases.get(h.coinType)?.symbol ?? null,
          roleInThatRug: h.role === "profit" ? "received the profits of" : h.role === "creator" ? "created" : h.role === "controller" ? "held the mint key of" : h.role === "relay" ? "relayed money for" : "funded",
          confirmedAt: s.cases.get(h.coinType)?.confirmedAt ?? "",
        })),
      });
    }
  };
  scan(trace.trail, "creator trail");
  scan(trace.controllerTrail, "controller trail");

  // Compare the creator's (and controller's) SUI coin objects with the pull coins of past rugs.
  // Best effort: if this check fails, the wallet matches above still stand.
  const coinMatches: CoinObjectMatch[] = [];
  const coinCheck = { checked: 0, note: s.byCoinObject.size ? "" : "no past rug has coin objects recorded yet" };
  if (s.byCoinObject.size) {
    try {
      const owners = [trace.creator.address, ...(trace.creator.controller ? [trace.creator.controller] : [])];
      for (const [i, owner] of owners.entries()) {
        const coins = await walletCoinObjects(owner);
        coinCheck.checked += coins.size;
        for (const [id, how] of coins) {
          for (const h of (s.byCoinObject.get(id) ?? []).filter((x) => x.coinType !== own)) {
            coinMatches.push({
              objectId: id,
              heldBy: i === 0 ? "creator" : "controller",
              how,
              pastRug: { coinType: h.coinType, symbol: s.cases.get(h.coinType)?.symbol ?? null, role: h.role === "gas_coin" ? "was a gas coin in the pull of" : "was created or changed by the pull of", digest: h.digest },
            });
          }
        }
      }
      coinCheck.note = coinMatches.length ? "" : `compared ${coinCheck.checked} coin objects of the creator; none is known from a past rug`;
    } catch (e) {
      coinCheck.note = `coin object check failed: ${e instanceof Error ? e.message.slice(0, 80) : e}`;
    }
  }

  const warnings: Warning[] = [...trace.warnings];
  const summary = [...trace.summary];
  if (coinMatches.length) {
    const names = [...new Set(coinMatches.map((m) => m.pastRug.symbol ?? short(m.pastRug.coinType.split("::")[0])))];
    warnings.unshift({
      code: "SAME_COIN_OBJECT_AS_PAST_RUG",
      severity: "warning",
      message: `${coinMatches.length} SUI coin object${coinMatches.length > 1 ? "s" : ""} in this creator's wallet ${coinMatches.length > 1 ? "were" : "was"} also in the pull of a past confirmed rug (${names.join(", ")}). The same money, with the same coin ID, moved from that rug to this creator.`,
    });
    for (const m of coinMatches) summary.push(`COIN MATCH: the ${m.heldBy} ${m.how} coin ${short(m.objectId)}, which ${m.pastRug.role} ${m.pastRug.symbol ?? short(m.pastRug.coinType.split("::")[0])} (tx ${m.pastRug.digest.slice(0, 10)}…).`);
  }
  const alreadyConfirmedRug = s.cases.has(own);
  if (alreadyConfirmedRug) {
    warnings.unshift({ code: "MATCHES_PAST_RUG", severity: "warning", message: "This coin is itself a confirmed rug in Revenant's memory." });
    summary.push("This coin is itself a confirmed rug in Revenant's memory.");
  }
  if (matches.length) {
    const names = [...new Set(matches.flatMap((m) => m.pastRugs.map((p) => p.symbol ?? short(p.coinType.split("::")[0]))))];
    warnings.unshift({
      code: "MATCHES_PAST_RUG",
      severity: "warning",
      message: `${matches.length} wallet${matches.length > 1 ? "s" : ""} in this token's trail also appear in past confirmed rugs (${names.join(", ")}). The creator's money is linked to earlier rugs.`,
    });
    for (const m of matches) {
      const p = m.pastRugs[0];
      summary.push(`MATCH: ${m.roleInThisTrace} ${short(m.address)} in the ${m.foundIn} ${p.roleInThatRug} the confirmed rug ${p.symbol ?? short(p.coinType.split("::")[0])}.`);
    }
  }

  return { ...trace, warnings, summary, rugMatches: matches, coinObjectMatches: coinMatches, coinObjectCheck: coinCheck, alreadyConfirmedRug, memory: { status: s.status, rugsKnown: s.cases.size, note: s.note } };
}
