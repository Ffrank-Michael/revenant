// Everything the website's case board shows, in one read-only answer.
// Sources: the rug index (Walrus, with snapshot fallback), the saved warning (Walrus, cached),
// proven links (data/proven-links.json, built from on-chain coin histories), and the BUBBLES watcher log.
// Never writes to Walrus. Server-side only.

import fs from "node:fs";
import path from "node:path";
import { getMemWal } from "./memwal";
import { withRetry } from "./retry";
import { loadRugIndex, type RugCase } from "./rugs";

const WARNINGS_NS = "revenant-warnings";
const WARNINGS_SNAPSHOT = path.join(process.cwd(), "data", "warnings.snapshot.json");
const WARNINGS_WAIT_MS = 12_000;
const CACHE_MS = 5 * 60_000;

type Warning = { symbol: string; flaggedAt: string; blobId: string | null };
type WarningState = { warnings: Warning[]; listedCount: number | null; at: number };
const g = globalThis as unknown as { __boardWarnings?: WarningState; __boardWarningsLoading?: Promise<void> };

function readWarningsSnapshot(): WarningState | null {
  try {
    return { ...JSON.parse(fs.readFileSync(WARNINGS_SNAPSHOT, "utf8")), at: 0 };
  } catch {
    return null;
  }
}

async function fetchWarnings(): Promise<void> {
  const m = getMemWal(WARNINGS_NS);
  const listed = await withRetry("list warnings", () => m.listMemories({ namespace: WARNINGS_NS, limit: 500 }));
  const r = await withRetry("recall warnings", () => m.recall({ query: "REVENANT WARNING flagged", namespace: WARNINGS_NS, limit: 200, sort: "recent" }));
  const warnings: Warning[] = [];
  for (const x of r.results) {
    const t = /^REVENANT WARNING \(flagged (\S+?)\): Revenant flagged the Sui coin (\S+?),/.exec(x.text);
    if (t) warnings.push({ symbol: t[2], flaggedAt: t[1], blobId: x.blob_id ?? null });
  }
  g.__boardWarnings = { warnings, listedCount: listed.memories.length, at: Date.now() };
  try {
    fs.writeFileSync(WARNINGS_SNAPSHOT, JSON.stringify({ warnings, listedCount: listed.memories.length, savedAt: new Date().toISOString() }, null, 1));
  } catch {
    /* the saved copy is a bonus */
  }
}

// Fresh cache: use it. Otherwise ask Walrus but wait only a few seconds; fall back to the saved copy.
async function getWarnings(): Promise<{ state: WarningState; fromSnapshot: boolean }> {
  const cached = g.__boardWarnings;
  if (cached && Date.now() - cached.at < CACHE_MS) return { state: cached, fromSnapshot: false };
  if (!g.__boardWarningsLoading) {
    g.__boardWarningsLoading = fetchWarnings()
      .catch((e) => console.warn("[board] could not read warnings from Walrus:", e))
      .finally(() => {
        g.__boardWarningsLoading = undefined;
      });
  }
  await Promise.race([g.__boardWarningsLoading, new Promise((r) => setTimeout(r, WARNINGS_WAIT_MS))]);
  if (g.__boardWarnings) return { state: g.__boardWarnings, fromSnapshot: false };
  return { state: readWarningsSnapshot() ?? { warnings: [], listedCount: null, at: 0 }, fromSnapshot: true };
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

// The last line the watcher wrote: when it looked, and how much SUI is still in the pool.
function readWatch(file: string) {
  try {
    const lines = fs.readFileSync(path.join(process.cwd(), file), "utf8").split("\n").filter((l) => l.includes(" verdict="));
    const last = lines[lines.length - 1];
    if (!last) return null;
    const num = (k: string) => Number(new RegExp(`${k}=([\\d.]+)`).exec(last)?.[1] ?? NaN);
    return { checkedAt: last.split(" ")[0], suiAdded: num("addedSui"), suiRemoved: num("removedSui") };
  } catch {
    return null;
  }
}

export type BoardRug = {
  symbol: string;
  coinType: string;
  creator: string;
  publishedAt: string;
  pulledAt: string | null;
  suiPutIn: number;
  suiTaken: number;
  exchange: string | null;
  checkedBy: "project owner" | "investigator" | "revenant";
  pullDigests: string[];
  pullCoinObjects: { id: string; role: string }[];
};
export type BoardLink = {
  from: string;
  to: string;
  coinId: string;
  relayCount: number;
  seconds: number;
  leftAt: string;
  arrivedAt: string;
  leftTx: string;
  arrivedTx: string;
  pullTx: string;
};
export type BoardWatched = {
  symbol: string;
  coinType: string;
  creator: string;
  publishedAt: string;
  status: "watching" | "pulled" | "unknown";
  suiInPool: number | null;
  lastCheckAt: string | null;
  warning: { flaggedAt: string; blobId: string | null } | null;
  pull: { at: string; digest: string; suiTaken: number; hoursAfterWarning: number | null } | null;
};
export type BoardData = {
  rugs: BoardRug[];
  watched: BoardWatched[];
  links: BoardLink[];
  counters: { rugsRemembered: number; memoriesOnWalrus: number | null; coinsChecked: number; coinsScreened: number; coinsNote: string };
  notes: string[];
};

const toRug = (c: RugCase): BoardRug => ({
  symbol: c.symbol ?? c.coinType.split("::").pop() ?? "?",
  coinType: c.coinType,
  creator: c.creator,
  publishedAt: c.publishedAt,
  pulledAt: c.firstRugAt,
  suiPutIn: c.suiPutIn,
  suiTaken: c.suiTaken,
  exchange: c.dex ?? null,
  checkedBy: c.reviewStatus ? "revenant" : c.confirmedBy?.by === "investigator" ? "investigator" : c.confirmedBy ? "project owner" : "revenant",
  pullDigests: c.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest),
  pullCoinObjects: (c.coinObjects ?? []).map((o) => ({ id: o.id, role: o.role })),
});

export async function getBoard(): Promise<BoardData> {
  const notes: string[] = [];
  const [idx, w] = await Promise.all([loadRugIndex(), getWarnings()]);
  if (idx.status !== "fresh") notes.push("Showing the last saved copy of the case file because Walrus was slow to answer.");
  if (w.fromSnapshot) notes.push("The warning record is a saved copy.");

  const defs = readJson<{ name: string; coinType: string; creator: string; publishedAt: string; watchFile: string }[]>("data/watched.json", []);
  const watched: BoardWatched[] = defs.map((d) => {
    const done = idx.cases.find((c) => c.coinType === d.coinType); // pulled, and saved as a rug
    const warn = w.state.warnings.filter((x) => x.symbol === d.name).sort((a, b) => a.flaggedAt.localeCompare(b.flaggedAt))[0] ?? null;
    const watch = readWatch(d.watchFile);
    const pullAt = done?.firstRugAt ?? null;
    return {
      symbol: d.name,
      coinType: d.coinType,
      creator: d.creator,
      publishedAt: d.publishedAt,
      status: done ? "pulled" : watch ? "watching" : "unknown",
      suiInPool: done ? 0 : watch && Number.isFinite(watch.suiAdded) ? Math.max(0, watch.suiAdded - (watch.suiRemoved || 0)) : null,
      lastCheckAt: watch?.checkedAt ?? null,
      warning: warn ? { flaggedAt: warn.flaggedAt, blobId: warn.blobId } : null,
      pull:
        done && pullAt
          ? {
              at: pullAt,
              digest: done.evidence.find((e) => e.kind === "liquidity_remove")?.digest ?? "",
              suiTaken: done.suiTaken,
              hoursAfterWarning: warn ? (Date.parse(pullAt) - Date.parse(warn.flaggedAt)) / 3_600_000 : null,
            }
          : null,
    };
  });
  const watchedTypes = new Set(defs.map((d) => d.coinType));
  const stats = readJson("data/board-stats.json", { coinsChecked: 0, coinsScreened: 0, note: "" });
  const links = readJson<{ links: BoardLink[] }>("data/proven-links.json", { links: [] }).links;

  return {
    rugs: idx.cases.filter((c) => !watchedTypes.has(c.coinType)).map(toRug),
    watched,
    links,
    counters: {
      rugsRemembered: idx.cases.length,
      memoriesOnWalrus: idx.listedCount !== null ? idx.listedCount + (w.state.listedCount ?? 0) : null,
      coinsChecked: stats.coinsChecked,
      coinsScreened: stats.coinsScreened,
      coinsNote: stats.note,
    },
    notes,
  };
}
