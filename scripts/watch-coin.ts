// Re-runs the rug check on one coin every N minutes and logs the result.
// If the coin shows ANY pull or sale (or the verdict leaves "not_rugged"), it saves the full result and EXITS,
// so whoever started it gets notified straight away.
//
// Usage: npx tsx --env-file=.env.local scripts/watch-coin.ts <name> <coinType> [minutes=10] [maxHours=12]
// It asks the running app (http://localhost:3000/api/verify). If the app is down it runs the check directly.
import fs from "node:fs";
import { verifyCoin } from "../lib/verify";
import { onPull } from "./on-pull";

// If warnedAtISO is given and the coin turns out "rugged", the automatic flow in scripts/on-pull.ts runs, then the watcher stops.
// Alive check: this file rewrites data/watch/<name>-alive.json every cycle. Run:  npx tsx scripts/watch-status.ts <name>
const [name, coin, minutesArg, hoursArg, warnedAt, warningBlob] = process.argv.slice(2);
const everyMs = Number(minutesArg ?? 10) * 60_000;
const stopAt = Date.now() + Number(hoursArg ?? 12) * 3_600_000;
const logFile = `data/watch/${name}-watch.log`;
const aliveFile = `data/watch/${name}-alive.json`;
const beat = (lastVerdict: string, via: string) =>
  fs.writeFileSync(aliveFile, JSON.stringify({ pid: process.pid, lastCheckAt: new Date().toISOString(), nextCheckAt: new Date(Date.now() + everyMs).toISOString(), everyMinutes: everyMs / 60000, stopsAt: new Date(stopAt).toISOString(), lastVerdict, via }, null, 1));
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
        beat(r.verdict, via);
        if (r.verdict !== "not_rugged" || n.liquidityRemovedSui > 0 || n.suiTakenFromSales > 0 || n.movedPctOfSupply) {
          const file = `data/watch/${name}-CHANGE-${t.replace(/[:.]/g, "-")}.json`;
          fs.writeFileSync(file, JSON.stringify(r, null, 1));
          out(`!!! CHANGE DETECTED at ${t}: verdict=${r.verdict}. Full result saved to ${file}`);
          out(r.summary.join("\n"));
          if (r.verdict === "rugged" && warnedAt) {
            out(">>> verdict is rugged: running the automatic flow (save rug, save outcome, rebuild index, commit)");
            const res = await onPull({ name, verify: r, warnedAt, warningBlob });
            for (const x of res.results) out(`    [${x.ok ? "ok" : "FAILED"}] ${x.step}: ${x.detail.slice(0, 200)}`);
            if (!res.saved) out(`!!! some steps failed. Re-run by hand: npx tsx --env-file=.env.local scripts/on-pull.ts ${file} ${warnedAt} ${warningBlob ?? ""}`);
          } else out("(verdict is not rugged, so nothing was saved to Walrus; look at the change file)");
          fs.writeFileSync(aliveFile, JSON.stringify({ stopped: true, reason: "change detected", at: new Date().toISOString() }));
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
