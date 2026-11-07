// Saves rugs that an investigator checked on Suiscan to "revenant-rugs".
// Usage: npx tsx --env-file=.env.local scripts/save-investigated.ts <path to scan-result.json> [--save]
// Without --save it only prints what it would save. Each rug is saved on its own; no link between rugs is claimed.
import fs from "node:fs";
import { traceCoin } from "../lib/trace";
import { buildRugCase, refreshRugIndex, rugCaseToMemoryText, saveRugCase } from "../lib/rugs";
import { pullCoinObjects } from "../lib/coinobjects";
import type { VerifyResult } from "../lib/verify";

const DEX: Record<string, string> = { VAPOR: "Cetus", KING: "Cetus", SHADOW: "Cetus", SAFU: "Cetus", BRRR: "Turbos" };

async function main() {
  const save = process.argv.includes("--save");
  const scan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  for (const [name, dex] of Object.entries(DEX)) {
    const row = scan.rows.find((r: { result?: VerifyResult }) => r.result?.coin.symbol === name && r.result.verdict === "rugged");
    if (!row) { console.log(`${name}: not found as rugged in the scan`); continue; }
    const verify = row.result as VerifyResult;
    const trace = await traceCoin(verify.coin.type);
    if (!trace.ok) { console.log(`${name}: trace failed: ${trace.message}`); continue; }
    const pulls = verify.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest);
    const coinObjects = await pullCoinObjects(pulls);
    const c = buildRugCase(trace, verify, { dex, coinObjects, confirmedBy: { by: "investigator", how: "checked on Suiscan", at: new Date().toISOString() } });
    if (!c) { console.log(`${name}: not rugged`); continue; }
    console.log(`${name} (${dex}): pull ${pulls[0]} | taken ${c.suiTaken.toFixed(2)} SUI | ${coinObjects.length} pull coin objects | wallets ${c.wallets.length} | ${rugCaseToMemoryText(c).length} chars`);
    if (!save) continue;
    const t0 = Date.now();
    const r = await saveRugCase(c);
    console.log(`   ${r.status}${r.blobId ? " blob " + r.blobId : ""} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (save) await refreshRugIndex();
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
