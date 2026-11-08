// Saves the 7 rugs the owner checked on Suiscan to "revenant-rugs" as confirmed (same way as BRRR).
// Usage: npx tsx --env-file=.env.local scripts/save-batch2.ts <scan1.json> <scan2.json> [--save]
// Without --save it only prints what it would save.
import fs from "node:fs";
import { traceCoin } from "../lib/trace";
import { buildRugCase, refreshRugIndex, rugCaseToMemoryText, saveRugCase } from "../lib/rugs";
import { pullCoinObjects } from "../lib/coinobjects";
import type { VerifyResult } from "../lib/verify";

const DEX: Record<string, string> = { EVE: "Cetus", ANAKIN: "Cetus", SIS: "Cetus", ANT: "Cetus", BLACKTOBER: "Turbos", SOH: "Turbos", OWLDACITY: "Bluefin" };

async function main() {
  const save = process.argv.includes("--save");
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const rows = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).rows as { result?: VerifyResult }[]);
  await refreshRugIndex();
  for (const [name, dex] of Object.entries(DEX)) {
    const row = rows.find((r) => r.result?.coin.symbol === name && r.result.verdict === "rugged");
    if (!row?.result) { console.log(`${name}: not found as rugged in the scan`); continue; }
    const verify = row.result;
    const trace = await traceCoin(verify.coin.type);
    if (!trace.ok) { console.log(`${name}: trace failed: ${trace.message}`); continue; }
    const pulls = verify.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest);
    const coinObjects = await pullCoinObjects(pulls);
    const c = buildRugCase(trace, verify, { dex, coinObjects, confirmedBy: { by: "investigator", how: "checked on Suiscan", at: new Date().toISOString() } });
    if (!c) { console.log(`${name}: not rugged`); continue; }
    console.log(`${name} (${dex}): pull ${pulls[0]} | put in ${c.suiPutIn.toFixed(0)} | taken ${c.suiTaken.toFixed(2)} SUI | ${coinObjects.length} pull coin objects | wallets ${c.wallets.length}`);
    for (const o of coinObjects) console.log(`     ${o.role.padEnd(11)} ${o.id}`);
    if (!save) continue;
    const t0 = Date.now();
    const r = await saveRugCase(c);
    console.log(`   ${r.status}${r.blobId ? " blob " + r.blobId : ""} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (save) await refreshRugIndex();
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
