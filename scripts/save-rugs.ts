// Saves CONFIRMED rugs to Walrus Memory (namespace "revenant-rugs") from saved case snapshots in data/cases/.
// Usage: npx tsx --env-file=.env.local scripts/save-rugs.ts AXIS VETO
// Only coins whose rug check says "rugged" are saved. Nothing else is touched.
import fs from "node:fs";
import { buildRugCase, refreshRugIndex, saveRugCase, rugCaseToMemoryText } from "../lib/rugs";
import type { TraceResult } from "../lib/trace";
import type { VerifyResult } from "../lib/verify";

async function main() {
  for (const name of process.argv.slice(2)) {
    const file = fs.readdirSync("data/cases").filter((f) => f.startsWith(name + "-")).sort().pop();
    if (!file) { console.log(`${name}: no case file found in data/cases`); continue; }
    const snap = JSON.parse(fs.readFileSync(`data/cases/${file}`, "utf8"));
    if (!snap.trace?.ok || !snap.verify?.ok) { console.log(`${name}: snapshot has errors, skipped`); continue; }
    const c = buildRugCase(snap.trace as TraceResult, snap.verify as VerifyResult);
    if (!c) { console.log(`${name}: verdict is "${snap.verify.verdict}", NOT saved`); continue; }
    const roles = c.wallets.reduce<Record<string, number>>((m, w) => ((m[w.role] = (m[w.role] ?? 0) + 1), m), {});
    console.log(`${name}: ${c.methods.join("+")} | put in ${c.suiPutIn.toFixed(0)} SUI, took ${c.suiTaken.toFixed(0)} SUI | wallets ${JSON.stringify(roles)} | memory text ${rugCaseToMemoryText(c).length} chars`);
    const t0 = Date.now();
    const r = await saveRugCase(c);
    console.log(`${name}: ${r.status}${r.blobId ? " blob " + r.blobId : ""} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  // Prove the index can be rebuilt from Walrus alone:
  await refreshRugIndex();
}
main().catch((e) => { console.error("FAILED:", e?.message, e?.status); process.exit(1); });
