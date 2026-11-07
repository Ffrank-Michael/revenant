// The rug check: did the creator of this coin really rug it?
//
// Server-side only. It reads the creator's own transactions through Tatum and looks for:
//   1. CREATOR DUMP    - the creator sold a big part of the supply for SUI.
//   2. LIQUIDITY PULL  - the creator took its SUI back out of the trading pool.
//
// Verdict: "rugged" (clear proof), "not_rugged" (no sign of it so far), or "unknown"
// (not enough data, or a gray area). A "not_rugged" answer is only true "as of now".
//
// KNOWN LIMIT: we only look at transactions SENT BY the creator (and by the wallet that
// got the mint key, if different). If the creator first moves coins or the pool position
// to another wallet and that wallet sells, we only see the "moved away" step.

import { getPublishInfo, q, type Ctx } from "./trace";
import { normalizeSuiAddress, parseCoinType } from "./sui";

// ---------------------------------------------------------------------------
// Settings - change these numbers to tune the rules
// ---------------------------------------------------------------------------
export const VERIFY_SETTINGS = {
  txPageSize: 25, // transactions per query
  maxPages: 8, // so at most 200 of the creator's transactions are checked
  dumpMinSoldPctOfSupply: 30, // "dump" = creator sold at least this % of the total supply...
  pullMinRemovedPctOfAdded: 50, // "pull" = creator took back at least this % of the SUI it put in the pool...
  // ...and in both cases the creator must end up at least this many SUI AHEAD:
  // (SUI received from sales + pool withdrawals) - (SUI put into pools + SUI spent buying the coin).
  // This stops us calling it a rug when someone only got their own money back, or traded at a loss.
  minNetSuiGain: 5,
  movedMinPct: 70, // gray area: moved away this % of supply without selling...
  movedMaxHoldingPct: 10, // ...and now holds less than this %
  maxEvidence: 12, // how many transactions to list as proof
} as const;

// Words that appear in the NAME of pool events. Add new DEX event names here as we meet them.
const ADD_LIQUIDITY_EVENT = /(AddLiquidity|OpenPosition|IncreaseLiquidity|LiquidityAdded|DepositLiquidity|CreatePool|PoolCreated)/i;
const REMOVE_LIQUIDITY_EVENT = /(RemoveLiquidity|ClosePosition|DecreaseLiquidity|LiquidityRemoved|WithdrawLiquidity|BurnLiquidity)/i;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export type EvidenceKind = "sell" | "liquidity_add" | "liquidity_remove" | "transfer_out";

export type Evidence = {
  kind: EvidenceKind;
  digest: string; // transaction id (look it up on a Sui explorer)
  at: string; // ISO time
  wallet: string;
  coinAmount: number; // coins moved (positive number)
  suiAmount: number; // SUI paid or received (positive number)
  note: string;
};

export type Verdict = "rugged" | "not_rugged" | "unknown";
export type RugMethod = "creator_dump" | "liquidity_pull";

export type VerifyResult = {
  ok: true;
  asOf: string;
  coin: { type: string; symbol: string | null; name: string | null; supply: number | null; decimals: number };
  creator: string;
  controller: string | null;
  publishedAt: string;
  verdict: Verdict;
  methods: RugMethod[]; // which rug types were proven (empty unless rugged)
  reasons: string[]; // why we decided that, in plain words
  numbers: {
    soldPctOfSupply: number | null;
    movedPctOfSupply: number | null; // sent to other wallets with no SUI coming back
    creatorHoldingPctOfSupply: number | null;
    suiTakenFromSales: number;
    liquidityAddedSui: number;
    liquidityRemovedSui: number;
    totalSuiTaken: number;
    suiSpentBuying: number; // SUI the creator spent buying the coin
    netSuiGained: number; // taken out minus put in/spent
  };
  firstRugAt: string | null;
  evidence: Evidence[];
  movedTo: { address: string; coinAmount: number }[]; // who received coins that were moved without a sale
  profitDestinations: { address: string; suiAmount: number }[]; // where SUI went after the money was taken
  unclassifiedEvents: string[]; // event names seen in coin-moving transactions we did not recognise
  scan: { transactionsChecked: number; complete: boolean };
  summary: string[];
  stats: { graphqlCalls: number; seconds: number };
};

export type VerifyFailure = {
  ok: false;
  code: "invalid_coin_type" | "package_not_found" | "upstream_error";
  message: string;
};

// ---------------------------------------------------------------------------
// Reading one wallet's transactions
// ---------------------------------------------------------------------------
type RawTx = {
  digest: string;
  effects: {
    status: string;
    timestamp: string;
    balanceChanges: { nodes: { owner: { address: string } | null; coinType: { repr: string }; amount: string }[] };
    events: { nodes: { contents: { type: { repr: string } } | null }[] };
  };
};

type WalletScan = {
  wallet: string;
  txs: RawTx[];
  complete: boolean;
  holdingRaw: bigint | null;
};

async function scanWallet(ctx: Ctx, wallet: string, coinType: string, fromCheckpoint: number): Promise<WalletScan> {
  const txs: RawTx[] = [];
  let after: string | null = null;
  let complete = false;

  for (let page = 0; page < VERIFY_SETTINGS.maxPages; page++) {
    const d: {
      transactions: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawTx[] };
    } = await q(
      ctx,
      `query($a:SuiAddress!,$from:UInt53,$n:Int!,$after:String){
         transactions(first:$n, after:$after, filter:{sentAddress:$a, afterCheckpoint:$from}){
           pageInfo{ hasNextPage endCursor }
           nodes{ digest effects{ status timestamp
             balanceChanges(first:50){ nodes{ owner{ address } coinType{ repr } amount } }
             events(first:30){ nodes{ contents{ type{ repr } } } } } }
         } }`,
      { a: wallet, from: Math.max(fromCheckpoint - 1, 0), n: VERIFY_SETTINGS.txPageSize, after },
    );
    txs.push(...d.transactions.nodes);
    if (!d.transactions.pageInfo.hasNextPage) {
      complete = true;
      break;
    }
    after = d.transactions.pageInfo.endCursor;
  }

  const bal = await q<{ address: { balance: { totalBalance: string } | null } | null }>(
    ctx,
    `query($a:SuiAddress!,$t:String!){ address(address:$a){ balance(coinType:$t){ totalBalance } } }`,
    { a: wallet, t: coinType },
  );
  const holding = bal.address?.balance?.totalBalance;
  return { wallet, txs, complete, holdingRaw: holding !== undefined ? BigInt(holding) : BigInt(0) };
}

// "0xabc…::pool::RemoveLiquidityEvent<...>" -> "pool::RemoveLiquidityEvent"
function eventName(repr: string): string {
  return repr.replace(/<[\s\S]*$/, "").split("::").slice(-2).join("::");
}

// ---------------------------------------------------------------------------
// Turning transactions into a story
// ---------------------------------------------------------------------------
type Counted = {
  evidence: (Evidence & { _coinRaw: bigint })[];
  soldCoinRaw: bigint;
  movedCoinRaw: bigint;
  addedCoinRaw: bigint;
  receivedCoinRaw: bigint;
  sellSuiRaw: bigint;
  addedSuiRaw: bigint;
  removedSuiRaw: bigint;
  boughtSuiRaw: bigint; // SUI the creator spent buying the coin
  movedTo: Map<string, bigint>;
  unclassified: Set<string>;
  profitOut: Map<string, bigint>;
  firstTakeAt: string | null;
};

function analyze(scan: WalletScan, coinType: string, decimals: number): Counted {
  const c: Counted = {
    evidence: [],
    soldCoinRaw: BigInt(0),
    movedCoinRaw: BigInt(0),
    addedCoinRaw: BigInt(0),
    receivedCoinRaw: BigInt(0),
    sellSuiRaw: BigInt(0),
    addedSuiRaw: BigInt(0),
    removedSuiRaw: BigInt(0),
    boughtSuiRaw: BigInt(0),
    movedTo: new Map(),
    unclassified: new Set(),
    profitOut: new Map(),
    firstTakeAt: null,
  };
  const zero = BigInt(0);
  const coinLower = coinType.toLowerCase();
  const human = (raw: bigint) => Number(raw < zero ? -raw : raw) / Math.pow(10, decimals);
  const sui = (raw: bigint) => Number(raw < zero ? -raw : raw) / 1e9;

  // Pass 1: classify every transaction.
  for (const tx of scan.txs) {
    if (tx.effects.status !== "SUCCESS") continue;
    const mine = tx.effects.balanceChanges.nodes.filter(
      (b) => b.owner && normalizeSuiAddress(b.owner.address) === scan.wallet,
    );
    const coinD = mine.filter((b) => b.coinType.repr.toLowerCase() === coinLower).reduce((s, b) => s + BigInt(b.amount), zero);
    const suiD = mine.filter((b) => b.coinType.repr.endsWith("::sui::SUI")).reduce((s, b) => s + BigInt(b.amount), zero);
    const names = tx.effects.events.nodes.flatMap((e) => (e.contents ? [eventName(e.contents.type.repr)] : []));
    const hasRemove = names.some((n) => REMOVE_LIQUIDITY_EVENT.test(n));
    const hasAdd = names.some((n) => ADD_LIQUIDITY_EVENT.test(n));
    const base = { digest: tx.digest, at: tx.effects.timestamp, wallet: scan.wallet };

    if (coinD > zero) c.receivedCoinRaw += coinD;
    if (coinD === zero && !hasAdd && !hasRemove) continue;

    const push = (kind: EvidenceKind, note: string) =>
      c.evidence.push({ ...base, kind, coinAmount: human(coinD), suiAmount: sui(suiD), note, _coinRaw: coinD < zero ? -coinD : coinD });

    if (hasRemove && !hasAdd) {
      if (suiD > zero) {
        c.removedSuiRaw += suiD;
        if (!c.firstTakeAt) c.firstTakeAt = tx.effects.timestamp;
        push("liquidity_remove", `Took ${sui(suiD).toLocaleString("en", { maximumFractionDigits: 2 })} SUI (and ${human(coinD).toLocaleString("en", { maximumFractionDigits: 0 })} coins) back out of the pool.`);
      }
    } else if (hasAdd && !hasRemove) {
      if (suiD < zero || coinD < zero) {
        c.addedSuiRaw += suiD < zero ? -suiD : zero;
        c.addedCoinRaw += coinD < zero ? -coinD : zero;
        push("liquidity_add", `Put ${sui(suiD).toLocaleString("en", { maximumFractionDigits: 2 })} SUI and ${human(coinD).toLocaleString("en", { maximumFractionDigits: 0 })} coins into a pool.`);
      }
    } else if (coinD < zero && suiD > zero) {
      c.soldCoinRaw += -coinD;
      c.sellSuiRaw += suiD;
      if (!c.firstTakeAt) c.firstTakeAt = tx.effects.timestamp;
      push("sell", `Sold ${human(coinD).toLocaleString("en", { maximumFractionDigits: 0 })} coins for ${sui(suiD).toLocaleString("en", { maximumFractionDigits: 2 })} SUI.`);
    } else if (coinD > zero && suiD < zero) {
      // The creator bought coins with SUI. Not evidence of a rug, but it counts against profit.
      c.boughtSuiRaw += -suiD;
    } else if (coinD < zero) {
      // Coins left the wallet and no SUI came back.
      c.movedCoinRaw += -coinD;
      push("transfer_out", `Sent ${human(coinD).toLocaleString("en", { maximumFractionDigits: 0 })} coins to other wallets (no SUI received).`);
      for (const b of tx.effects.balanceChanges.nodes) {
        if (!b.owner || b.coinType.repr.toLowerCase() !== coinLower) continue;
        const who = normalizeSuiAddress(b.owner.address);
        if (who !== scan.wallet && BigInt(b.amount) > zero) c.movedTo.set(who, (c.movedTo.get(who) ?? zero) + BigInt(b.amount));
      }
      // Not a recognised sale or pool event: remember the event names so we can learn them.
      for (const n of names) c.unclassified.add(n);
    }
  }

  // Pass 2: once money was taken, where did the SUI go? (plain SUI transfers to other wallets)
  if (c.firstTakeAt) {
    for (const tx of scan.txs) {
      if (tx.effects.status !== "SUCCESS" || tx.effects.timestamp < c.firstTakeAt) continue;
      const nodes = tx.effects.balanceChanges.nodes;
      const myCoin = nodes.some(
        (b) => b.owner && normalizeSuiAddress(b.owner.address) === scan.wallet && b.coinType.repr.toLowerCase() === coinLower,
      );
      if (myCoin) continue; // that is a sale/pool transaction, already counted
      const mySui = nodes
        .filter((b) => b.owner && normalizeSuiAddress(b.owner.address) === scan.wallet && b.coinType.repr.endsWith("::sui::SUI"))
        .reduce((s, b) => s + BigInt(b.amount), zero);
      if (mySui >= zero) continue;
      for (const b of nodes) {
        if (!b.owner || !b.coinType.repr.endsWith("::sui::SUI")) continue;
        const who = normalizeSuiAddress(b.owner.address);
        if (who !== scan.wallet && BigInt(b.amount) > zero) c.profitOut.set(who, (c.profitOut.get(who) ?? zero) + BigInt(b.amount));
      }
    }
  }
  return c;
}

const pct = (part: bigint, whole: bigint): number => Number((part * BigInt(10000)) / whole) / 100;
const fmt = (n: number, digits = 2) => n.toLocaleString("en", { maximumFractionDigits: digits });
// Percentages: tiny but non-zero values show as "less than 0.01" instead of a misleading "0".
const fmtPct = (n: number, digits = 1) => (n > 0 && n < 0.01 ? "less than 0.01" : fmt(n, digits));
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// The public function
// ---------------------------------------------------------------------------
export async function verifyCoin(rawCoinType: string): Promise<VerifyResult | VerifyFailure> {
  const started = Date.now();
  const ctx: Ctx = { calls: 0 };

  const parsed = parseCoinType(rawCoinType);
  if (!parsed) {
    return {
      ok: false,
      code: "invalid_coin_type",
      message: "That does not look like a coin type. Expected something like 0x1234...::module::NAME",
    };
  }

  try {
    const info = await getPublishInfo(ctx, parsed);
    if (!("creator" in info)) return info;

    const decimals = info.coin.decimals ?? 9;
    const supplyRaw = info.coin.supply ? BigInt(info.coin.supply) : null;
    const fromCheckpoint = info.checkpoint ?? 0;

    // The creator, plus the wallet that got the mint key if it is a different one.
    const wallets = [info.creator, ...(info.controller ? [info.controller] : [])];
    const scans: WalletScan[] = [];
    for (const w of wallets) scans.push(await scanWallet(ctx, w, parsed.coinType, fromCheckpoint));
    const counts = scans.map((s) => analyze(s, parsed.coinType, decimals));

    const zero = BigInt(0);
    const sum = (f: (c: Counted) => bigint) => counts.reduce((s, c) => s + f(c), zero);
    const soldCoin = sum((c) => c.soldCoinRaw);
    const movedCoin = sum((c) => c.movedCoinRaw);
    const sellSui = sum((c) => c.sellSuiRaw);
    const addedSui = sum((c) => c.addedSuiRaw);
    const removedSui = sum((c) => c.removedSuiRaw);
    const holding = scans.reduce((s, x) => s + (x.holdingRaw ?? zero), zero);

    const toSui = (raw: bigint) => Number(raw) / 1e9;
    const soldPct = supplyRaw && supplyRaw > zero ? pct(soldCoin, supplyRaw) : null;
    const movedPct = supplyRaw && supplyRaw > zero ? pct(movedCoin, supplyRaw) : null;
    const holdingPct = supplyRaw && supplyRaw > zero ? pct(holding, supplyRaw) : null;
    const suiFromSales = toSui(sellSui);
    const suiAdded = toSui(addedSui);
    const suiRemoved = toSui(removedSui);
    const suiBought = toSui(sum((c) => c.boughtSuiRaw));
    const totalTaken = suiFromSales + suiRemoved;
    // How far ahead did the creator come out? (what it took out minus what it put in or spent)
    const netGain = totalTaken - suiAdded - suiBought;
    const complete = scans.every((s) => s.complete);
    const txChecked = scans.reduce((s, x) => s + x.txs.length, 0);

    // ---- Decide ----
    const S = VERIFY_SETTINGS;
    const methods: RugMethod[] = [];
    const reasons: string[] = [];
    const ahead = netGain >= S.minNetSuiGain;

    if (soldPct !== null && soldPct >= S.dumpMinSoldPctOfSupply && ahead) {
      methods.push("creator_dump");
      reasons.push(`The creator sold ${fmt(soldPct, 1)}% of the entire supply and received ${fmt(suiFromSales)} SUI for it.`);
    }
    const removedPctOfAdded = suiAdded > 0 ? (suiRemoved / suiAdded) * 100 : 0;
    if (suiAdded > 0 && removedPctOfAdded >= S.pullMinRemovedPctOfAdded && ahead) {
      methods.push("liquidity_pull");
      reasons.push(`The creator put ${fmt(suiAdded)} SUI into a trading pool and took ${fmt(suiRemoved)} SUI back out (${fmt(removedPctOfAdded, 0)}% of it).`);
    }
    if (methods.length > 0) {
      reasons.push(`In total the creator came out ${fmt(netGain)} SUI ahead (took out ${fmt(totalTaken)} SUI, put in or spent ${fmt(suiAdded + suiBought)} SUI).`);
    }

    let verdict: Verdict;
    if (methods.length > 0) {
      verdict = "rugged";
    } else {
      const grayMoved = movedPct !== null && holdingPct !== null && movedPct >= S.movedMinPct && holdingPct <= S.movedMaxHoldingPct;
      const bigSellNoGain = soldPct !== null && soldPct >= S.dumpMinSoldPctOfSupply && !ahead;
      const bigPullNoGain = suiAdded > 0 && removedPctOfAdded >= S.pullMinRemovedPctOfAdded && !ahead;
      const partialPull = suiAdded > 0 && suiRemoved > 0 && removedPctOfAdded < S.pullMinRemovedPctOfAdded && suiRemoved >= S.minNetSuiGain;
      const partialSell = soldPct !== null && soldPct > 5 && soldPct < S.dumpMinSoldPctOfSupply && suiFromSales >= S.minNetSuiGain;
      if (grayMoved) {
        verdict = "unknown";
        reasons.push(`The creator sent ${fmt(movedPct!, 1)}% of the supply to other wallets without receiving SUI and now holds only ${fmt(holdingPct!, 1)}%. That looks like a hand-off or a preparation to dump, but no sale by the creator was proven.`);
      } else if (partialPull || partialSell) {
        verdict = "unknown";
        if (partialPull) reasons.push(`The creator took ${fmt(suiRemoved)} SUI out of a pool (of ${fmt(suiAdded)} SUI put in), which is below our ${S.pullMinRemovedPctOfAdded}% line.`);
        if (partialSell) reasons.push(`The creator sold ${fmt(soldPct!, 1)}% of the supply for ${fmt(suiFromSales)} SUI, which is below our ${S.dumpMinSoldPctOfSupply}% line.`);
      } else if (!complete) {
        verdict = "unknown";
        reasons.push(`Only the first ${txChecked} transactions of the creator were checked and none showed a rug. Later activity was not checked.`);
      } else {
        verdict = "not_rugged";
        if (bigSellNoGain) reasons.push(`The creator sold ${fmt(soldPct!, 1)}% of the supply but came out ${netGain >= 0 ? `only ${fmt(netGain)} SUI ahead` : `${fmt(-netGain)} SUI behind`} (sales ${fmt(suiFromSales)} SUI, minus ${fmt(suiAdded + suiBought)} SUI put in or spent). That is below our ${S.minNetSuiGain} SUI profit line, so no real money was taken from others.`);
        else if (bigPullNoGain) reasons.push(`The creator took ${fmt(suiRemoved)} SUI out of the pool but only got its own ${fmt(suiAdded)} SUI back (net ${fmt(netGain)} SUI), so nobody else's money was taken.`);
        else {
          if (holdingPct !== null) reasons.push(`The creator still holds ${fmtPct(holdingPct)}% of the supply.`);
          if (suiAdded > 0 && suiRemoved === 0) reasons.push(`The creator put ${fmt(suiAdded)} SUI into a trading pool and has not taken it out.`);
          if (soldCoin === zero) reasons.push("The creator has not sold any of the coin.");
        }
        reasons.push("No sign of a rug yet. This can change, so it is only true as of now.");
      }
    }
    if (!complete && verdict === "rugged") reasons.push(`Note: only the first ${txChecked} transactions were checked, so the real totals may be larger.`);
    if (supplyRaw === null) reasons.push("The coin's total supply is not readable on-chain, so percentages could not be calculated.");

    // ---- Evidence ----
    const all = counts.flatMap((c) => c.evidence).sort((a, b) => a.at.localeCompare(b.at));
    const rank: Record<EvidenceKind, number> = { liquidity_remove: 0, sell: 0, liquidity_add: 1, transfer_out: 2 };
    const evidence: Evidence[] = [...all]
      .sort((a, b) => rank[a.kind] - rank[b.kind] || b.suiAmount - a.suiAmount || a.at.localeCompare(b.at))
      .slice(0, S.maxEvidence)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map(({ _coinRaw, ...rest }) => (void _coinRaw, rest));

    const mergeMaps = (key: "movedTo" | "profitOut") => {
      const m = new Map<string, bigint>();
      for (const c of counts) for (const [k, v] of c[key]) m.set(k, (m.get(k) ?? zero) + v);
      return [...m.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, 5);
    };
    const movedTo = mergeMaps("movedTo").map(([address, v]) => ({ address, coinAmount: Number(v) / Math.pow(10, decimals) }));
    const profitDestinations = mergeMaps("profitOut").map(([address, v]) => ({ address, suiAmount: toSui(v) }));
    const unclassified = [...new Set(counts.flatMap((c) => [...c.unclassified]))];
    const firstRugAt = verdict === "rugged" ? counts.map((c) => c.firstTakeAt).filter((x): x is string => !!x).sort()[0] ?? null : null;

    const symbol = info.coin.symbol ?? info.coin.name ?? short(info.coin.packageId);
    const summary = [
      `${symbol} was published by ${short(info.creator)} on ${info.publishedAt.slice(0, 19).replace("T", " ")} UTC.`,
      `Verdict: ${verdict.toUpperCase().replace("_", " ")}${methods.length ? ` (${methods.map((m) => (m === "creator_dump" ? "creator dumped" : "liquidity pulled")).join(" + ")})` : ""}.`,
      ...reasons,
    ];
    if (verdict === "rugged" && profitDestinations.length) {
      summary.push(`After taking the money, the creator sent SUI on to ${profitDestinations.map((p) => `${short(p.address)} (${fmt(p.suiAmount)} SUI)`).join(", ")}.`);
    }

    return {
      ok: true,
      asOf: new Date().toISOString(),
      coin: {
        type: info.coin.type,
        symbol: info.coin.symbol,
        name: info.coin.name,
        supply: supplyRaw !== null ? Number(supplyRaw) / Math.pow(10, decimals) : null,
        decimals,
      },
      creator: info.creator,
      controller: info.controller,
      publishedAt: info.publishedAt,
      verdict,
      methods,
      reasons,
      numbers: {
        soldPctOfSupply: soldPct,
        movedPctOfSupply: movedPct,
        creatorHoldingPctOfSupply: holdingPct,
        suiTakenFromSales: suiFromSales,
        liquidityAddedSui: suiAdded,
        liquidityRemovedSui: suiRemoved,
        totalSuiTaken: totalTaken,
        suiSpentBuying: suiBought,
        netSuiGained: netGain,
      },
      firstRugAt,
      evidence,
      movedTo,
      profitDestinations,
      unclassifiedEvents: unclassified,
      scan: { transactionsChecked: txChecked, complete },
      summary,
      stats: { graphqlCalls: ctx.calls, seconds: Math.round((Date.now() - started) / 100) / 10 },
    };
  } catch (e) {
    return { ok: false, code: "upstream_error", message: e instanceof Error ? e.message : String(e) };
  }
}
