// Re-saves BUBBLES as a confirmed rug (the owner checked the pull on Suiscan), same way as AXIS and VETO.
// Usage: npx tsx --env-file=.env.local scripts/confirm-bubbles.ts [--save]
import fs from "node:fs";
import { traceCoin } from "../lib/trace";
import { buildRugCase, refreshRugIndex, rugCaseToMemoryText, saveRugCase } from "../lib/rugs";
import { pullCoinObjects } from "../lib/coinobjects";
import type { VerifyResult } from "../lib/verify";

async function main() {
  const save = process.argv.includes("--save");
  const file = fs.readdirSync("data/cases").filter((f) => f.startsWith("BUBBLES-PULLED-")).sort().pop()!;
  const verify = JSON.parse(fs.readFileSync(`data/cases/${file}`, "utf8")).verify as VerifyResult;
  const pulls = verify.evidence.filter((e) => e.kind === "liquidity_remove" || e.kind === "sell").map((e) => e.digest);
  const trace = await traceCoin(verify.coin.type);
  if (!trace.ok) throw new Error("trace failed: " + trace.message);
  const coinObjects = await pullCoinObjects(pulls);
  const c = buildRugCase(trace, verify, {
    coinObjects,
    confirmedBy: { by: "project owner", how: "checked the transactions on Suiscan", at: new Date().toISOString() },
  });
  if (!c) throw new Error("not rugged");
  console.log(`pull ${pulls.join(",")} | taken ${c.suiTaken.toFixed(2)} SUI | ${coinObjects.length} coin objects | confirmedBy ${c.confirmedBy?.by} | reviewStatus ${c.reviewStatus ?? "none"}`);
  for (const o of coinObjects) console.log(`   ${o.role.padEnd(11)} ${o.id}`);
  console.log(rugCaseToMemoryText(c).split("\n")[0].slice(0, 300));
  if (!save) return;
  const r = await saveRugCase(c, { replace: true });
  console.log(`${r.status} ${r.blobId ?? ""}`);
  await refreshRugIndex();
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
