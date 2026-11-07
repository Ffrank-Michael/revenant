// Saves a timestamped snapshot (trace + rug check) of coins into data/cases/.
// Usage: npx tsx --env-file=.env.local scripts/save-cases.ts <name>=<coinType> [<name>=<coinType> ...]
import fs from "node:fs";
import { traceCoin } from "../lib/trace";
import { verifyCoin } from "../lib/verify";

async function main() {
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  for (const arg of process.argv.slice(2)) {
    const [name, coinType] = arg.split("=");
    const [trace, verify] = [await traceCoin(coinType), await verifyCoin(coinType)];
    const file = `data/cases/${name}-${stamp}.json`;
    fs.writeFileSync(file, JSON.stringify({ name, coinType, capturedAt, trace, verify }, null, 1));
    console.log(file, "| trace ok:", trace.ok, "| verdict:", verify.ok ? verify.verdict : verify.message);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
