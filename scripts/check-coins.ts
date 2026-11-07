// Dev check: trace a coin and compare its creator's coin objects with past rugs (reads Walrus + chain, writes nothing).
// Usage: npx tsx --env-file=.env.local scripts/check-coins.ts <coinType>
import { traceCoin } from "../lib/trace";
import { addRugMemory, refreshRugIndex } from "../lib/rugs";

async function main() {
  await refreshRugIndex();
  const t = await traceCoin(process.argv[2]);
  if (!t.ok) { console.log("trace failed:", t.message); return; }
  const r = await addRugMemory(t);
  console.log("memory:", r.memory);
  console.log("creator:", r.creator.address);
  console.log("coin object check:", r.coinObjectCheck);
  console.log("coin object matches:", JSON.stringify(r.coinObjectMatches, null, 1));
  console.log("wallet matches:", r.rugMatches.length, r.rugMatches.map((m) => `${m.roleInThisTrace} ${m.address.slice(0, 10)}`).join(", "));
  console.log("warnings:", r.warnings.map((w) => w.code).join(", "));
}
main().catch((e) => { console.error("FAILED:", e?.message); process.exit(1); });
