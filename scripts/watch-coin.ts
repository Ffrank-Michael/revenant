// Re-runs the rug check on one coin every N minutes and logs the result.
// If the coin shows ANY pull or sale (or the verdict leaves "not_rugged"), it saves the full result and EXITS,
// so whoever started it gets notified straight away.
//
// Usage: npx tsx --env-file=.env.local scripts/watch-coin.ts <name> <coinType> [minutes=10] [maxHours=12]
// It asks the running app (http://localhost:3000/api/verify). If the app is down it runs the check directly.
import fs from "node:fs";
import { verifyCoin } from "../lib/verify";

const [name, coin, minutesArg, hoursArg] = process.argv.slice(2);
const everyMs = Number(minutesArg ?? 10) * 60_000;
const stopAt = Date.now() + Number(hoursArg ?? 12) * 3_600_000;
const logFile = `data/watch/${name}-watch.log`;
const out = (line: string) => { console.log(line); fs.appendFileSync(logFile, line + "\n"); };

async function check() {
  try {
    const res = await fetch(`http://localhost:3000/api/verify?coin=${encodeURIComponent(coin)}`, { signal: AbortSignal.timeout(100_000) });
    const json = await res.json();
    if (json?.ok) return { via: "api", r: json };
    throw new Error(json?.message ?? `HTTP ${res.status}`);
  } catch (e) {
    const r = await verifyCoin(coin); // fall back so a downed app cannot make us miss the pull
    return { via: "direct (api failed: " + (e instanceof Error ? e.message.slice(0, 60) : e) + ")", r };
  }
}

async function main() {
  out(`# watching ${name} ${coin} every ${everyMs / 60000} min, started ${new Date().toISOString()}`);
  while (Date.now() < stopAt) {
    const t = new Date().toISOString();
    try {
      const { via, r } = await check();
      if (!r.ok) { out(`${t} ERROR ${r.message}`); }
      else {
        const n = r.numbers;
        out(`${t} verdict=${r.verdict} removedSui=${n.liquidityRemovedSui.toFixed(2)} addedSui=${n.liquidityAddedSui.toFixed(2)} soldPct=${(n.soldPctOfSupply ?? 0).toFixed(2)} movedPct=${(n.movedPctOfSupply ?? 0).toFixed(2)} creatorHoldPct=${(n.creatorHoldingPctOfSupply ?? 0).toFixed(4)} txs=${r.scan.transactionsChecked} via=${via}`);
        if (r.verdict !== "not_rugged" || n.liquidityRemovedSui > 0 || n.suiTakenFromSales > 0 || n.movedPctOfSupply) {
          const file = `data/watch/${name}-CHANGE-${t.replace(/[:.]/g, "-")}.json`;
          fs.writeFileSync(file, JSON.stringify(r, null, 1));
          out(`!!! CHANGE DETECTED at ${t}: verdict=${r.verdict}. Full result saved to ${file}`);
          out(r.summary.join("\n"));
          process.exit(0);
        }
      }
    } catch (e) {
      out(`${t} CHECK FAILED: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((res) => setTimeout(res, everyMs));
  }
  out(`# stopped (time limit) ${new Date().toISOString()}`);
}
main();
