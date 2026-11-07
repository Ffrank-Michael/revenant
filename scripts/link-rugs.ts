// Do any of the rugs in memory connect to each other (or to a watched coin), and HOW STRONG is each link?
// Read-only. Usage: npx tsx --env-file=.env.local scripts/link-rugs.ts [watchedCoinName=BUBBLES]
//
// Three kinds of evidence, kept apart:
//  A. EXACT COIN ID: a pull's SUI coin object (same ID) was later owned by a wallet that belongs to another rug.
//     We follow each coin's whole ownership history, so this is proof the money moved.
//  B. SAME WALLET ADDRESS: one address appears in two rugs' trails (creator, funder, relay or profit wallet).
//     Exact, but a shared relay or service wallet does not prove one person.
//  C. SIMILAR PATTERN: same exchange, timing, amounts, relay chains. Suggestive only.
import fs from "node:fs";
import { suiGraphQL } from "../lib/tatum";
import { normalizeSuiAddress } from "../lib/sui";
import { walletCoinObjects } from "../lib/coinobjects";
import { refreshRugIndex, type RugCase } from "../lib/rugs";

type Owner = { address: string; sinceTx: string; at: string };

async function ownersOf(objectId: string): Promise<Owner[]> {
  const d: { objectVersions: { nodes: { asMoveObject: { owner: { address?: { address: string } } | null } | null; previousTransaction: { digest: string; effects: { timestamp: string } } | null }[] } } =
    await suiGraphQL(
      `query($a:SuiAddress!){ objectVersions(address:$a, first:50){ nodes{ asMoveObject{ owner{ ... on AddressOwner{ address{ address } } } } previousTransaction{ digest effects{ timestamp } } } } }`,
      { a: objectId },
    );
  const out: Owner[] = [];
  for (const n of d.objectVersions.nodes) {
    const a = n.asMoveObject?.owner?.address?.address;
    if (a && n.previousTransaction) out.push({ address: normalizeSuiAddress(a), sinceTx: n.previousTransaction.digest, at: n.previousTransaction.effects.timestamp });
  }
  return out;
}

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

async function main() {
  const watchedName = process.argv[2] ?? "BUBBLES";
  await refreshRugIndex();
  const rugs: RugCase[] = JSON.parse(fs.readFileSync("data/rug-index.snapshot.json", "utf8")).cases;
  console.log(`rugs in memory: ${rugs.map((r) => r.symbol).join(", ")} (${rugs.length})`);

  // The watched coin (not a rug yet): wallets from its saved trace.
  const wf = fs.readdirSync("data/cases").filter((f) => f.startsWith(watchedName + "-") && !f.includes("PULLED")).sort().pop()!;
  const wsnap = JSON.parse(fs.readFileSync(`data/cases/${wf}`, "utf8"));
  const watched = {
    name: watchedName,
    creator: normalizeSuiAddress(wsnap.trace.creator.address),
    wallets: new Map<string, string>(),
  };
  for (const t of [wsnap.trace.trail, wsnap.trace.controllerTrail]) for (const w of t?.wallets ?? []) watched.wallets.set(normalizeSuiAddress(w.address), w.role === "creator" ? "creator" : w.isRelay ? "relay" : `hop ${w.hop} funder`);

  // Who belongs to which rug (by address).
  type Party = { name: string; role: string };
  const members = new Map<string, Party[]>();
  const addMember = (addr: string, p: Party) => { const l = members.get(addr) ?? []; l.push(p); members.set(addr, l); };
  for (const r of rugs) for (const w of r.wallets) addMember(w.address, { name: r.symbol ?? r.coinType.slice(0, 10), role: w.role });
  for (const [a, role] of watched.wallets) addMember(a, { name: `${watchedName} (not rugged yet)`, role });

  // B. same wallet address in more than one rug/coin
  console.log("\n=== B. SAME WALLET ADDRESS in more than one case ===");
  let b = 0;
  for (const [addr, parts] of members) {
    const names = [...new Set(parts.map((p) => p.name))];
    if (names.length < 2) continue;
    b++;
    console.log(`${addr}\n    ${parts.map((p) => `${p.name}: ${p.role}`).join(" | ")}`);
  }
  if (!b) console.log("none");

  // A. exact coin IDs: shared directly, and followed through ownership history
  console.log("\n=== A. EXACT COIN ID ===");
  const byCoin = new Map<string, { rug: string; role: string }[]>();
  for (const r of rugs) for (const o of r.coinObjects ?? []) { const l = byCoin.get(o.id) ?? []; l.push({ rug: r.symbol ?? "?", role: o.role }); byCoin.set(o.id, l); }
  for (const [id, l] of byCoin) if (new Set(l.map((x) => x.rug)).size > 1) console.log(`SAME coin recorded in two pulls: ${id}\n    ${l.map((x) => `${x.rug} (${x.role})`).join(" | ")}`);

  let aLinks = 0;
  const tracked = [...byCoin.keys()];
  console.log(`following the ownership history of ${tracked.length} pull coin objects…`);
  for (const id of tracked) {
    const origin = byCoin.get(id)!.map((x) => x.rug).join("/");
    let owners: Owner[] = [];
    try { owners = await ownersOf(id); } catch (e) { console.log(`   ${short(id)}: history unavailable (${e instanceof Error ? e.message.slice(0, 60) : e})`); continue; }
    const seen = new Set<string>();
    for (const o of owners) {
      if (seen.has(o.address)) continue;
      seen.add(o.address);
      for (const p of members.get(o.address) ?? []) {
        if (origin.split("/").includes(p.name)) continue; // belongs to its own rug: not a cross link
        aLinks++;
        console.log(`LINK  coin ${id}\n      came from the ${origin} pull and was later owned by ${o.address} (${p.name}: ${p.role}) from ${o.at.slice(0, 19)}Z, tx ${o.sinceTx}`);
      }
    }
  }
  if (!aLinks) console.log("no pull coin reached a wallet of another case");

  // The watched coin's creator: coin objects it holds now / used recently, against every rug's pull coins.
  console.log(`\n=== A2. ${watchedName} creator's own coin objects vs. all pull coins ===`);
  const mine = await walletCoinObjects(watched.creator);
  let a2 = 0;
  for (const [id, how] of mine) for (const x of byCoin.get(id) ?? []) { a2++; console.log(`MATCH ${id} (${how}) = pull coin of ${x.rug} (${x.role})`); }
  console.log(`${mine.size} coin objects compared, ${a2} match`);

  // C. patterns
  console.log("\n=== C. SIMILAR PATTERNS (suggestive only) ===");
  console.log("coin      | pulled (UTC)        | exchange | put in | taken  | relay wallets | trail wallets");
  for (const r of rugs.sort((x, y) => (x.firstRugAt ?? "").localeCompare(y.firstRugAt ?? ""))) {
    const relays = r.wallets.filter((w) => w.role === "relay").length;
    console.log(`${(r.symbol ?? "?").padEnd(9)} | ${(r.firstRugAt ?? "?").slice(0, 19).padEnd(19)} | ${(r.dex ?? "?").padEnd(8)} | ${r.suiPutIn.toFixed(0).padStart(6)} | ${r.suiTaken.toFixed(0).padStart(6)} | ${String(relays).padStart(13)} | ${r.wallets.length}`);
  }
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
