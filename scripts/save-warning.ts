// Saves one plain-text warning to Walrus Memory (namespace "revenant-warnings") and recalls it to confirm.
// Usage: npx tsx --env-file=.env.local scripts/save-warning.ts
import fs from "node:fs";
import { getMemWal, MEMWAL_SAVE_WAIT_MS } from "../lib/memwal";
import { withRetry } from "../lib/retry";

const NS = "revenant-warnings";
const veto = JSON.parse(fs.readFileSync(fs.readdirSync("data/cases").filter((f) => f.startsWith("VETO-")).sort().pop()!.replace(/^/, "data/cases/"), "utf8"));
const flaggedAt = new Date().toISOString();

const text =
  `REVENANT WARNING (flagged ${flaggedAt}): Revenant flagged the Sui coin BUBBLES, coin type ` +
  `0x25607c967deeb5e22e48d275bd2af73eb147b57c67e679c8f42f6e925e767ee0::bubbles::BUBBLES, as funded by the proceeds of the VETO rug through a relay chain. ` +
  `VETO (${veto.coinType}) was published on 2026-11-06 and its creator 0xe1f9891e6cbb2faf32b39a9478440ad3ce20449f0bc8cb67627645d66fd8be49 pulled 10,290 SUI out of its pool on 2026-11-07 at 00:11:17 UTC (tx D4ABGoXhv94z8Rk2jGHYs3WC1JEuMyzYQs2a9U2egMty). ` +
  `At 00:25:29 UTC that creator sent 8,949.57 SUI (tx DFVkgk7p7SSujNupF6ExGvnkZ6GjuWj18WpvjSFvcqCQ) to relay wallet 0xd4498a0784a88b54e6371a2b2f0bc37baa968ec32a8f5dc63807f20fd00b8632, ` +
  `and the same amount hopped through 10 relay wallets, about 8 seconds apart, to the BUBBLES creator 0xeb1a4123e5cd6a63ba9558c362b27b8b3bced6455dd1ba47ef4d1582e1250b89 at 00:27:55 UTC (tx 2ViU5kjRYSkfPARz91cQqukEGxg2ikGEUKoBbRAN7dVw). ` +
  `That creator published BUBBLES at 00:28:12 UTC (tx 9U1NnDTKChaTfhsDtGrJ44KhcDJZvBNPfWGYaj52tDxb) and put 8,000 SUI into a pool at 00:28:28 UTC (tx GNUj7cHVwjKCNxRPxmX73dpYE2aHibnPGoUNwiGwgPAt). ` +
  `Status when flagged: BUBBLES had not pulled its liquidity yet (rug check verdict not_rugged as of 2026-11-07 22:48 UTC). ` +
  `This is an automated warning that BUBBLES matches the AXIS to VETO to BUBBLES pattern, not a confirmed rug.`;

async function main() {
  const m = getMemWal(NS);
  const t0 = Date.now();
  const saved = await withRetry("save warning", () => m.rememberAndWait(text, NS, { timeoutMs: MEMWAL_SAVE_WAIT_MS }));
  console.log(`SAVED in ${((Date.now() - t0) / 1000).toFixed(0)}s:`, JSON.stringify(saved));
  let found = null;
  for (let i = 0; i < 5 && !found; i++) {
    if (i) await new Promise((r) => setTimeout(r, 3000));
    const r = await withRetry("recall warning", () => m.recall({ query: "BUBBLES warning funded by VETO rug relay chain", namespace: NS, limit: 5 }));
    found = r.results.find((x) => x.text.includes("REVENANT WARNING") && x.text.includes(flaggedAt)) ?? null;
  }
  console.log(found ? `CONFIRMED by recall (blob ${found.blob_id}, distance ${found.distance.toFixed(3)})` : "NOT FOUND by recall yet (save succeeded; index may lag)");
  if (found) console.log("recalled text starts:", found.text.slice(0, 160) + "...");
}
main().catch((e) => { console.error("FAILED:", e?.message, e?.status); process.exit(1); });
