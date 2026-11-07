// Dev tool: scan recently published Sui coins and run the rug check on the ones that had real money.
//
// Run from the project folder:
//   npx tsx --env-file=.env.local scripts/scan-coins.ts
//
// It never writes to Walrus. It only READS the chain through Tatum and writes a report file.
//
// Rules (set by the project owner):
//  - Only check coins where the creator moved at least MIN_SUI SUI in a transaction that also moved
//    the coin (putting money into a pool/curve, or taking it out). This is a cheap stand-in for
//    "had real money in it". Test coins and empty coins are skipped.
//  - Budget: stop after MAX_COINS coins checked or MAX_CALLS Tatum requests, whichever comes first.
//  - Look at the last 4 weeks first. Only go further back if fewer than 2 rugs were found,
//    and never before the start of available history (23 Jan 2026).

import fs from "node:fs";
import { getTatumRequestCount, suiGraphQL } from "../lib/tatum";
import { verifyCoin, type VerifyResult } from "../lib/verify";
import { normalizeSuiAddress } from "../lib/sui";

const MAX_COINS = 60;
const MAX_CALLS = 1500;
const MIN_SUI = 50;
const CHECKPOINTS_PER_DAY = 365_034; // measured: about 4.2 checkpoints per second
const FIRST_WINDOW_DAYS = 28;
const HISTORY_FLOOR_CHECKPOINT = 237_661_232; // 23 Jan 2026
const SKIP_NEWEST_DAYS = 0.5; // very new coins have had no time to rug yet

const OUT = process.argv[2] ?? "scan-result.json";
const baseline = getTatumRequestCount();
const calls = () => getTatumRequestCount() - baseline;
const overBudget = () => calls() >= MAX_CALLS;
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)} | ${calls()} calls] ${m}`);

type Candidate = { coinType: string; creator: string; publishedAt: string; checkpoint: number };
type Row = Candidate & { peakSui: number | null; status: "skipped_small" | "checked" | "error"; result?: VerifyResult; error?: string };

// All coin-creating first-version packages published between two checkpoints.
async function discover(start: number, end: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let after: string | null = null;
  let pkgs = 0;
  for (;;) {
    const d: {
      packages: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          version: number;
          previousTransaction: {
            sender: { address: string } | null;
            effects: {
              timestamp: string;
              checkpoint: { sequenceNumber: number } | null;
              objectChanges: { nodes: { idCreated: boolean; outputState: { asMoveObject: { contents: { type: { repr: string } } | null } | null } | null }[] };
            };
          } | null;
        }[];
      };
    } = await suiGraphQL(
      `query($s:UInt53,$e:UInt53,$after:String){ packages(first:50, after:$after, filter:{afterCheckpoint:$s, beforeCheckpoint:$e}){
         pageInfo{ hasNextPage endCursor }
         nodes{ version previousTransaction{ sender{ address } effects{ timestamp checkpoint{ sequenceNumber }
           objectChanges(first:40){ nodes{ idCreated outputState{ asMoveObject{ contents{ type{ repr } } } } } } } } } } }`,
      { s: start, e: end, after },
    );
    for (const p of d.packages.nodes) {
      pkgs++;
      const tx = p.previousTransaction;
      if (p.version !== 1 || !tx?.sender) continue;
      for (const c of tx.effects.objectChanges.nodes) {
        const repr = c.idCreated ? c.outputState?.asMoveObject?.contents?.type.repr : undefined;
        const m = repr ? /::coin::TreasuryCap<(0x[0-9a-fA-F]+::[A-Za-z0-9_]+::[A-Za-z0-9_]+)>$/.exec(repr) : null;
        if (m) {
          const [pkgId, mod, name] = m[1].split("::");
          out.push({
            coinType: `${normalizeSuiAddress(pkgId)}::${mod}::${name}`,
            creator: normalizeSuiAddress(tx.sender.address),
            publishedAt: tx.effects.timestamp,
            checkpoint: tx.effects.checkpoint?.sequenceNumber ?? start,
          });
          break;
        }
      }
    }
    if (!d.packages.pageInfo.hasNextPage) break;
    after = d.packages.pageInfo.endCursor;
  }
  log(`checkpoints ${start}..${end}: ${pkgs} packages, ${out.length} coins`);
  return out;
}

// One cheap call: did the creator move >= MIN_SUI SUI in a transaction that also moved this coin?
async function peakSuiMoved(c: Candidate): Promise<number> {
  const d: {
    transactions: {
      nodes: { effects: { status: string; balanceChanges: { nodes: { owner: { address: string } | null; coinType: { repr: string }; amount: string }[] } } }[];
    };
  } = await suiGraphQL(
    `query($a:SuiAddress!,$from:UInt53){ transactions(first:25, filter:{sentAddress:$a, afterCheckpoint:$from}){
       nodes{ effects{ status balanceChanges(first:50){ nodes{ owner{ address } coinType{ repr } amount } } } } } }`,
    { a: c.creator, from: Math.max(c.checkpoint - 1, 0) },
  );
  let peak = 0;
  for (const tx of d.transactions.nodes) {
    if (tx.effects.status !== "SUCCESS") continue;
    const mine = tx.effects.balanceChanges.nodes.filter((b) => b.owner && normalizeSuiAddress(b.owner.address) === c.creator);
    const coinMoved = mine.some((b) => b.coinType.repr.toLowerCase() === c.coinType.toLowerCase() && BigInt(b.amount) !== BigInt(0));
    const sui = mine.filter((b) => b.coinType.repr.endsWith("::sui::SUI")).reduce((s, b) => s + BigInt(b.amount), BigInt(0));
    if (coinMoved) peak = Math.max(peak, Math.abs(Number(sui)) / 1e9);
  }
  return peak;
}

async function main() {
  const latest = Number(
    (await suiGraphQL<{ checkpoint: { sequenceNumber: number } }>("{ checkpoint { sequenceNumber } }")).checkpoint.sequenceNumber,
  );
  const rows: Row[] = [];
  const stats = { windows: 0, coinsFound: 0, prechecked: 0, skippedSmall: 0, checked: 0, errors: 0 };
  let end = latest - Math.round(CHECKPOINTS_PER_DAY * SKIP_NEWEST_DAYS);
  let stopReason = "";
  let day = 0;

  for (;;) {
    const start = Math.max(end - CHECKPOINTS_PER_DAY, HISTORY_FLOOR_CHECKPOINT);
    if (start >= end) { stopReason = "reached the start of available history (23 Jan 2026)"; break; }
    const rugs = rows.filter((r) => r.result?.verdict === "rugged").length;
    if (day >= FIRST_WINDOW_DAYS && rugs >= 2) { stopReason = `scanned the last ${FIRST_WINDOW_DAYS} days and found ${rugs} rugs`; break; }
    if (stats.checked >= MAX_COINS) { stopReason = `checked ${MAX_COINS} coins (budget)`; break; }
    if (overBudget()) { stopReason = `used ${MAX_CALLS} Tatum calls (budget)`; break; }

    const coins = (await discover(start, end)).reverse(); // newest first
    stats.windows++;
    stats.coinsFound += coins.length;

    for (const c of coins) {
      if (stats.checked >= MAX_COINS || overBudget()) break;
      try {
        stats.prechecked++;
        const peak = await peakSuiMoved(c);
        if (peak < MIN_SUI) { stats.skippedSmall++; rows.push({ ...c, peakSui: peak, status: "skipped_small" }); continue; }
        const result = await verifyCoin(c.coinType);
        if (!result.ok) { stats.errors++; rows.push({ ...c, peakSui: peak, status: "error", error: result.message }); log(`ERROR ${c.coinType.slice(0, 20)}…: ${result.message.slice(0, 80)}`); continue; }
        stats.checked++;
        rows.push({ ...c, peakSui: peak, status: "checked", result });
        log(`#${stats.checked} ${result.coin.symbol ?? "?"} (${c.publishedAt.slice(0, 10)}) peak ${peak.toFixed(0)} SUI -> ${result.verdict}${result.methods.length ? " " + result.methods.join("+") : ""}`);
      } catch (e) {
        stats.errors++;
        rows.push({ ...c, peakSui: null, status: "error", error: e instanceof Error ? e.message : String(e) });
        log(`ERROR ${c.coinType.slice(0, 20)}…: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
    }
    end = start;
    day++;
  }

  const oldest = rows.length ? rows.map((r) => r.publishedAt).sort()[0] : null;
  const report = { stopReason: stopReason || "budget", daysScanned: day, oldestCoinSeen: oldest, stats, tatumCalls: calls(), rows };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  log(`DONE: ${report.stopReason}. windows=${stats.windows} coinsFound=${stats.coinsFound} skippedSmall=${stats.skippedSmall} checked=${stats.checked} errors=${stats.errors}`);
}

main().catch((e) => { console.error("scan crashed:", e); process.exit(1); });
