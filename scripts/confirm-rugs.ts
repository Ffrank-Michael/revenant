// Re-saves rugs to Walrus Memory with (1) the owner's confirmation and (2) the pull's coin object IDs.
// Usage:
//   npx tsx --env-file=.env.local scripts/confirm-rugs.ts AXIS VETO           (dry run: shows what would be saved)
//   npx tsx --env-file=.env.local scripts/confirm-rugs.ts AXIS VETO --save    (saves a NEW version to Walrus)
// Walrus keeps the old version; the index always uses the newest one for a coin.
import fs from "node:fs";
import { buildRugCase, refreshRugIndex, saveRugCase, rugCaseToMemoryText } from "../lib/rugs";
import { pullCoinObjects } from "../lib/coinobjects";
import type { TraceResult } from "../lib/trace";
import type { VerifyResult } from "../lib/verify";

async function main() {
  const save = process.argv.includes("--save");
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  for (const name of names) {
    const file = fs.readdirSync("data/cases").filter((f) => f.startsWith(name + "-")).sort().pop();
    if (!file) { console.log(`${name}: no case file`); continue; }
    const snap = JSON.parse(fs.readFileSync(`data/cases/${file}`, "utf8"));
    const verify = snap.verify as VerifyResult;
    const pullDigests = verify.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest);
    const coinObjects = await pullCoinObjects(pullDigests);
    const c = buildRugCase(snap.trace as TraceResult, verify, {
      coinObjects,
      confirmedBy: { by: "project owner", how: "checked the transactions on Suiscan", at: new Date().toISOString() },
    });
    if (!c) { console.log(`${name}: not rugged, skipped`); continue; }
    console.log(`\n${name}: ${coinObjects.length} coin objects from ${pullDigests.length} pull transaction(s)`);
    for (const o of coinObjects) console.log(`   ${o.role.padEnd(11)} ${o.id}  (tx ${o.digest.slice(0, 10)}…)`);
    console.log(`   memory text: ${rugCaseToMemoryText(c).length} chars`);
    if (!save) continue;
    const t0 = Date.now();
    const r = await saveRugCase(c, { replace: true });
    console.log(`   ${r.status}${r.blobId ? " blob " + r.blobId : ""} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (save) await refreshRugIndex();
}
main().catch((e) => { console.error("FAILED:", e?.message, e?.status); process.exit(1); });
