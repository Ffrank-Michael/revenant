// The trace engine: given a Sui coin type, find who created it and where that
// wallet's first money came from, going back a few hops.
//
// Server-side only. It reads public blockchain data through Tatum (lib/tatum.ts).
// It does NOT talk to Walrus Memory yet.

import { suiGraphQL } from "./tatum";
import { exchangeLabel } from "./exchanges";
import { normalizeSuiAddress, parseCoinType } from "./sui";

// ---------------------------------------------------------------------------
// Settings - change these numbers to tune how the trace behaves
// ---------------------------------------------------------------------------
export const TRACE_SETTINGS = {
  maxRealHops: 3, // how many real (non-relay) funders to follow back
  maxRelayWallets: 12, // safety cap on pass-through wallets
  busyTxCount: 50, // a wallet is "busy" if its newest 50 transactions...
  busyWithinMinutes: 30, // ...all happened within this many minutes
  relayMaxTxs: 6, // a relay wallet has at most this many transactions in its whole life
  relayAmountTolerance: 0.05, // a relay forwards the same amount (within 5%)
  relayMaxHoldMinutes: 10, // ...and forwards it within 10 minutes
  freshCreatorHours: 24, // creator's first-ever activity is this close to publishing => "fresh wallet"
  nearHistoryFloorHours: 24, // wallet first seen this close to the start of available data => may be older
  firstTxScan: 25, // how many of a wallet's oldest transactions we look at for its first deposit
} as const;

// Tatum only keeps history from some checkpoint onward. This is the value we last saw;
// if Tatum says the real number is different we learn it automatically (see q()).
let historyFloor = 237_661_232;
let historyFloorTimestamp: { floor: number; ms: number } | null = null;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export type Activity = {
  txCount: number; // how many of its newest transactions we saw (max 50)
  moreExist: boolean; // true if it has even more transactions than that
  spanMinutes: number | null; // time between the oldest and newest of those
  perHour: number | null;
};

export type Funding = {
  from: string; // the wallet that sent the SUI
  amountSui: number;
  at: string; // ISO time
  digest: string; // transaction id (look it up on a Sui explorer)
};

export type TrailWallet = {
  address: string;
  role: "creator" | "funder";
  hop: number | null; // 0 = creator, 1..3 = real funders. null = relay wallet (not counted)
  isRelay: boolean;
  exchange: string | null; // label if it is on our exchange list
  isBusy: boolean;
  activity: Activity;
  firstSeenAt: string | null; // time of the oldest transaction we can see for this wallet
  mayBeOlder: boolean; // true if firstSeenAt is right at the start of available history
  // The first SUI this wallet ever received (before the point we are tracing from).
  // `firstFunding.from` is the next wallet in the trail.
  firstFunding: Funding | null;
};

export type StopCode =
  | "max_hops_reached"
  | "exchange"
  | "busy_wallet"
  | "relay_cap"
  | "no_earlier_funding"
  | "history_limit"
  | "cycle"
  | "error";

export type Trail = {
  wallets: TrailWallet[];
  stoppedBecause: { code: StopCode; message: string };
};

export type WarningCode =
  | "RELAY_CHAIN"
  | "CREATOR_IS_BUSY_WALLET"
  | "CONTROL_HANDED_OFF"
  | "SPONSORED_PUBLISH"
  | "FRESH_CREATOR_WALLET"
  | "FUNDED_BY_EXCHANGE"
  | "FUNDED_BY_BUSY_WALLET"
  | "TYPE_DEFINED_IN_UPGRADE"
  | "HISTORY_LIMIT"
  | "NO_FUNDING_FOUND";

export type Warning = { code: WarningCode; severity: "info" | "warning"; message: string };

export type TraceResult = {
  ok: true;
  coin: {
    type: string;
    packageId: string;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    supply: string | null;
  };
  creator: {
    address: string;
    publishedAt: string;
    publishDigest: string;
    gasSponsor: string | null; // only set when someone else paid the fee
    // Who held the TreasuryCap (the "mint key") right after publishing, if it was not the publisher.
    controller: string | null;
  };
  trail: Trail; // follows the creator's money
  controllerTrail: Trail | null; // only when the controller is a different wallet
  warnings: Warning[];
  summary: string[]; // the same story in plain words
  stats: { graphqlCalls: number; seconds: number };
};

export type TraceFailure = {
  ok: false;
  code: "invalid_coin_type" | "package_not_found" | "upstream_error";
  message: string;
};

// ---------------------------------------------------------------------------
// Talking to Tatum
// ---------------------------------------------------------------------------
export type Ctx = { calls: number };

// Runs a GraphQL query. Counts calls, and if Tatum says "data below earliest available;
// lowest available checkpoint is N" it learns N and tries once more.
export async function q<T>(ctx: Ctx, query: string, vars: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    ctx.calls++;
    try {
      return await suiGraphQL<T>(query, { ...vars, floor: historyFloor });
    } catch (e) {
      const m = /lowest available checkpoint is (\d+)/.exec(e instanceof Error ? e.message : "");
      if (m && attempt === 0 && Number(m[1]) > historyFloor) {
        historyFloor = Number(m[1]);
        continue;
      }
      throw e;
    }
  }
}

async function getHistoryFloorMs(ctx: Ctx): Promise<number> {
  if (historyFloorTimestamp?.floor === historyFloor) return historyFloorTimestamp.ms;
  const d = await q<{ checkpoint: { timestamp: string } | null }>(
    ctx,
    `query($floor:UInt53){ checkpoint(sequenceNumber:$floor){ timestamp } }`,
  );
  const ms = d.checkpoint ? Date.parse(d.checkpoint.timestamp) : 0;
  historyFloorTimestamp = { floor: historyFloor, ms };
  return ms;
}

// ---------------------------------------------------------------------------
// Looking at one wallet
// ---------------------------------------------------------------------------

// How fast has this wallet been transacting? (used to spot exchanges and services)
async function getActivity(ctx: Ctx, address: string): Promise<Activity> {
  const d = await q<{
    transactions: { pageInfo: { hasPreviousPage: boolean }; nodes: { effects: { timestamp: string } }[] };
  }>(
    ctx,
    `query($a:SuiAddress!,$floor:UInt53){
       transactions(last:50, filter:{affectedAddress:$a, afterCheckpoint:$floor}){
         pageInfo{ hasPreviousPage }
         nodes{ effects{ timestamp } }
       } }`,
    { a: address },
  );
  const times = d.transactions.nodes.map((n) => Date.parse(n.effects.timestamp));
  if (times.length === 0) return { txCount: 0, moreExist: false, spanMinutes: null, perHour: null };
  const spanMs = Math.max(...times) - Math.min(...times);
  const spanMinutes = spanMs / 60000;
  const hours = Math.max(spanMs / 3_600_000, 1 / 60);
  return {
    txCount: times.length,
    moreExist: d.transactions.pageInfo.hasPreviousPage,
    spanMinutes: Math.round(spanMinutes * 10) / 10,
    perHour: Math.round(times.length / hours),
  };
}

function isBusy(a: Activity): boolean {
  return (
    a.txCount >= TRACE_SETTINGS.busyTxCount &&
    a.spanMinutes !== null &&
    a.spanMinutes <= TRACE_SETTINGS.busyWithinMinutes
  );
}

type FirstFundingResult = { funding: Funding | null; firstSeenAt: string | null };

// Looks at the wallet's oldest transactions and finds the first one that gave it SUI
// from someone else, before `beforeMs`.
async function getFirstFunding(ctx: Ctx, address: string, beforeMs: number): Promise<FirstFundingResult> {
  const d = await q<{
    transactions: {
      nodes: {
        digest: string;
        sender: { address: string } | null;
        effects: {
          status: string;
          timestamp: string;
          balanceChanges: {
            nodes: { owner: { address: string } | null; coinType: { repr: string }; amount: string }[];
          };
        };
      }[];
    };
  }>(
    ctx,
    `query($a:SuiAddress!,$floor:UInt53,$n:Int!){
       transactions(first:$n, filter:{affectedAddress:$a, afterCheckpoint:$floor}){
         nodes{
           digest
           sender{ address }
           effects{ status timestamp
             balanceChanges(first:30){ nodes{ owner{ address } coinType{ repr } amount } } }
         } } }`,
    { a: address, n: TRACE_SETTINGS.firstTxScan },
  );

  const nodes = d.transactions.nodes;
  const firstSeenAt = nodes[0]?.effects.timestamp ?? null;
  for (const t of nodes) {
    if (t.effects.status !== "SUCCESS") continue;
    if (Date.parse(t.effects.timestamp) >= beforeMs) break; // nodes are oldest-first
    if (!t.sender || normalizeSuiAddress(t.sender.address) === address) continue;
    const mine = t.effects.balanceChanges.nodes.find(
      (b) => b.owner && normalizeSuiAddress(b.owner.address) === address && b.coinType.repr.endsWith("::sui::SUI"),
    );
    if (mine && BigInt(mine.amount) > BigInt(0)) {
      return {
        firstSeenAt,
        funding: {
          from: normalizeSuiAddress(t.sender.address),
          amountSui: Number(mine.amount) / 1e9,
          at: t.effects.timestamp,
          digest: t.digest,
        },
      };
    }
  }
  return { funding: null, firstSeenAt };
}

// A "relay" wallet just passes money along: it received X, forwarded about the same X
// within minutes, and has hardly any other history. `outgoing` is what it forwarded.
function looksLikeRelay(activity: Activity, incoming: Funding, outgoing: Funding): boolean {
  if (activity.moreExist || activity.txCount > TRACE_SETTINGS.relayMaxTxs) return false;
  const sameAmount =
    Math.abs(incoming.amountSui - outgoing.amountSui) <= incoming.amountSui * TRACE_SETTINGS.relayAmountTolerance;
  const heldMs = Date.parse(outgoing.at) - Date.parse(incoming.at);
  return sameAmount && heldMs >= 0 && heldMs <= TRACE_SETTINGS.relayMaxHoldMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Following the money back
// ---------------------------------------------------------------------------
async function traceFunding(ctx: Ctx, start: string, publishedAtMs: number): Promise<Trail> {
  const wallets: TrailWallet[] = [];
  const seen = new Set<string>();
  const floorMs = await getHistoryFloorMs(ctx);

  let current = start;
  let beforeMs = publishedAtMs; // only deposits made before this moment count
  let previousFunding: Funding | null = null; // what the previous wallet received (= what `current` sent it)
  let realHops = 0;
  let relays = 0;

  for (;;) {
    seen.add(current);
    const isStart = wallets.length === 0;

    let activity: Activity, found: FirstFundingResult;
    try {
      [activity, found] = await Promise.all([
        getActivity(ctx, current),
        getFirstFunding(ctx, current, beforeMs),
      ]);
    } catch (e) {
      return {
        wallets,
        stoppedBecause: {
          code: "error",
          message: `Stopped because a lookup failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }

    const label = exchangeLabel(current);
    const busy = isBusy(activity);
    const relay =
      !isStart && !label && !busy && found.funding !== null && previousFunding !== null &&
      looksLikeRelay(activity, found.funding, previousFunding);

    let hop: number | null = 0;
    if (!isStart) {
      if (relay) {
        hop = null;
        relays++;
      } else {
        hop = ++realHops;
      }
    }

    const mayBeOlder =
      found.firstSeenAt !== null &&
      Date.parse(found.firstSeenAt) - floorMs < TRACE_SETTINGS.nearHistoryFloorHours * 3_600_000;

    wallets.push({
      address: current,
      role: isStart ? "creator" : "funder",
      hop,
      isRelay: relay,
      exchange: label,
      isBusy: busy,
      activity,
      firstSeenAt: found.firstSeenAt,
      mayBeOlder,
      firstFunding: found.funding,
    });

    const stop = (code: StopCode, message: string): Trail => ({ wallets, stoppedBecause: { code, message } });

    if (label) return stop("exchange", `Reached ${label}. Exchanges tell us nothing about who is behind the money.`);
    if (busy) {
      return stop(
        "busy_wallet",
        `Reached a very busy wallet (${activity.txCount} transactions in ${activity.spanMinutes} minutes), probably an exchange or a service. It tells us nothing about who is behind the money.`,
      );
    }
    if (relay && relays >= TRACE_SETTINGS.maxRelayWallets) {
      return stop("relay_cap", `Stopped after ${relays} pass-through wallets without reaching the end of the trail.`);
    }
    if (!isStart && !relay && realHops >= TRACE_SETTINGS.maxRealHops) {
      return stop("max_hops_reached", `Followed the money back ${realHops} real hops, as planned.`);
    }
    if (!found.funding) {
      return stop(
        "no_earlier_funding",
        `No earlier SUI deposit found for this wallet in its first ${TRACE_SETTINGS.firstTxScan} transactions.`,
      );
    }
    if (mayBeOlder) {
      return stop(
        "history_limit",
        "This wallet's history starts at the very beginning of the data we can read, so it may be older than what we can see.",
      );
    }
    if (seen.has(found.funding.from)) {
      return stop("cycle", "The money came back to a wallet already in the trail.");
    }

    // Move one wallet back.
    previousFunding = found.funding;
    beforeMs = Date.parse(found.funding.at);
    current = found.funding.from;
  }
}

// ---------------------------------------------------------------------------
// Step 1: coin -> creator
// ---------------------------------------------------------------------------
type PublishTx = {
  sender: { address: string } | null;
  gasInput: { gasSponsor: { address: string } | null } | null;
  effects: {
    timestamp: string;
    checkpoint: { sequenceNumber: number } | null;
    objectChanges: {
      nodes: {
        idCreated: boolean;
        outputState: {
          asMoveObject: {
            contents: { type: { repr: string } } | null;
            owner: { __typename: string; address?: { address: string } } | null;
          } | null;
        } | null;
      }[];
    };
  };
};

export type PublishInfo = {
  coin: TraceResult["coin"];
  creator: string;
  publishedAt: string;
  publishDigest: string;
  checkpoint: number | null; // the checkpoint the coin was published in
  sponsor: string | null; // who paid the fee (may be the creator)
  controller: string | null; // who got the TreasuryCap, only if not the publisher
  typeDefinedInUpgrade: boolean;
};

// Finds who published the coin and when. Shared by the trace and the rug check.
export async function getPublishInfo(
  ctx: Ctx,
  parsed: NonNullable<ReturnType<typeof parseCoinType>>,
): Promise<PublishInfo | TraceFailure> {
  // The coin's package, and the first version of it (version 1 = the original publish).
  const [meta, pkg] = await Promise.all([
    q<{ coinMetadata: { name: string | null; symbol: string | null; decimals: number | null; supply: string | null } | null }>(
      ctx,
      `query($t:String!){ coinMetadata(coinType:$t){ name symbol decimals supply } }`,
      { t: parsed.coinType },
    ),
    q<{ packageVersions: { nodes: { address: string; version: number; previousTransaction: { digest: string } | null }[] } }>(
      ctx,
      `query($a:SuiAddress!){ packageVersions(address:$a, first:1){
         nodes{ address version previousTransaction{ digest } } } }`,
      { a: parsed.packageId },
    ),
  ]);

  const first = pkg.packageVersions.nodes[0];
  if (!first?.previousTransaction) {
    return { ok: false, code: "package_not_found", message: `No package found at ${parsed.packageId}. Check the coin type.` };
  }

  const publish = (
    await q<{ transaction: PublishTx | null }>(
      ctx,
      `query($d:String!){ transaction(digest:$d){
         sender{ address }
         gasInput{ gasSponsor{ address } }
         effects{ timestamp checkpoint{ sequenceNumber }
           objectChanges(first:50){ nodes{ idCreated outputState{ asMoveObject{
             contents{ type{ repr } }
             owner{ __typename ... on AddressOwner{ address{ address } } } } } } } } } }`,
      { d: first.previousTransaction.digest },
    )
  ).transaction;

  if (!publish?.sender) {
    return { ok: false, code: "package_not_found", message: "Could not read the transaction that published this package." };
  }

  const creator = normalizeSuiAddress(publish.sender.address);
  const sponsor = publish.gasInput?.gasSponsor ? normalizeSuiAddress(publish.gasInput.gasSponsor.address) : null;

  // Who got the TreasuryCap (the key that can mint more coins) when it was created?
  const caps = publish.effects.objectChanges.nodes
    .filter((c) => c.idCreated && c.outputState?.asMoveObject?.contents?.type.repr.includes("::coin::TreasuryCap<"))
    .map((c) => c.outputState!.asMoveObject!);
  const myCap = caps.find((c) => c.contents!.type.repr.toLowerCase().includes(`<${parsed.coinType.toLowerCase()}>`)) ?? caps[0];
  const controllerRaw = myCap?.owner?.__typename === "AddressOwner" ? myCap.owner.address?.address ?? null : null;
  const controller = controllerRaw && normalizeSuiAddress(controllerRaw) !== creator ? normalizeSuiAddress(controllerRaw) : null;

  return {
    coin: {
      type: parsed.coinType,
      packageId: parsed.packageId,
      name: meta.coinMetadata?.name ?? null,
      symbol: meta.coinMetadata?.symbol ?? null,
      decimals: meta.coinMetadata?.decimals ?? null,
      supply: meta.coinMetadata?.supply ?? null,
    },
    creator,
    publishedAt: publish.effects.timestamp,
    publishDigest: first.previousTransaction.digest,
    checkpoint: publish.effects.checkpoint?.sequenceNumber ?? null,
    sponsor,
    controller,
    typeDefinedInUpgrade: normalizeSuiAddress(first.address) !== parsed.packageId,
  };
}

export async function traceCoin(rawCoinType: string): Promise<TraceResult | TraceFailure> {
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
    const { creator, controller, sponsor, publishedAt } = info;

    // Follow the creator's money (and the controller's, when it is a different wallet).
    const publishedAtMs = Date.parse(publishedAt);
    const trail = await traceFunding(ctx, creator, publishedAtMs);
    const controllerTrail = controller ? await traceFunding(ctx, controller, publishedAtMs) : null;

    const warnings = buildWarnings({
      creator,
      controller,
      sponsor,
      publishedAtMs,
      trail,
      controllerTrail,
      typeDefinedInUpgrade: info.typeDefinedInUpgrade,
    });

    const result: TraceResult = {
      ok: true,
      coin: info.coin,
      creator: {
        address: creator,
        publishedAt,
        publishDigest: info.publishDigest,
        gasSponsor: sponsor && sponsor !== creator ? sponsor : null,
        controller,
      },
      trail,
      controllerTrail,
      warnings,
      summary: [],
      stats: { graphqlCalls: ctx.calls, seconds: 0 },
    };
    result.summary = buildSummary(result);
    result.stats.seconds = Math.round((Date.now() - started) / 100) / 10;
    return result;
  } catch (e) {
    return {
      ok: false,
      code: "upstream_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Warnings and the plain-words summary
// ---------------------------------------------------------------------------
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;
const sui = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 2 });

function buildWarnings(p: {
  creator: string;
  controller: string | null;
  sponsor: string | null;
  publishedAtMs: number;
  trail: Trail;
  controllerTrail: Trail | null;
  typeDefinedInUpgrade: boolean;
}): Warning[] {
  const out: Warning[] = [];
  const w = (code: WarningCode, severity: "info" | "warning", message: string) => out.push({ code, severity, message });
  const creatorStep = p.trail.wallets[0];

  // Relay chain: two or more pass-through wallets in a row.
  const relayCount = p.trail.wallets.filter((x) => x.isRelay).length;
  if (relayCount >= 2) {
    w(
      "RELAY_CHAIN",
      "warning",
      `Funded through a relay chain: the creator's money passed through ${relayCount} pass-through wallets (each held the same amount for only seconds or minutes before forwarding it). This is a common way to hide where money came from.`,
    );
  }

  if (creatorStep?.isBusy) {
    w("CREATOR_IS_BUSY_WALLET", "warning", "The wallet that published the coin is extremely busy. It is probably a launchpad or service wallet, not the person who launched the token, so this trail may not point at the real person.");
  }
  if (p.controller) {
    w("CONTROL_HANDED_OFF", "warning", `The publisher handed the coin's mint key (TreasuryCap) to a different wallet, ${short(p.controller)}. That wallet is the likelier real owner, so its funding trail is traced too.`);
  }
  if (p.sponsor && p.sponsor !== p.creator) {
    w("SPONSORED_PUBLISH", "info", `Someone else (${short(p.sponsor)}) paid the fee for publishing. The coin may have been published by a service on someone's behalf.`);
  }
  const first = creatorStep?.firstSeenAt;
  if (first && p.publishedAtMs - Date.parse(first) < TRACE_SETTINGS.freshCreatorHours * 3_600_000 && !creatorStep.mayBeOlder) {
    w("FRESH_CREATOR_WALLET", "info", `The creator wallet was brand new: its first activity was less than ${TRACE_SETTINGS.freshCreatorHours} hours before it published the coin.`);
  }
  if (p.typeDefinedInUpgrade) {
    w("TYPE_DEFINED_IN_UPGRADE", "info", "This coin type was added in an upgrade of the package, not in the original publish. The 'creator' shown is the original publisher, who may differ from whoever added the coin.");
  }

  for (const [label, trail] of [["creator", p.trail], ["controller", p.controllerTrail]] as const) {
    if (!trail) continue;
    const last = trail.wallets[trail.wallets.length - 1];
    if (last?.exchange) w("FUNDED_BY_EXCHANGE", "info", `The ${label}'s trail leads to an exchange (${last.exchange}).`);
    if (last?.isBusy && !last.exchange && last.role === "funder") w("FUNDED_BY_BUSY_WALLET", "info", `The ${label}'s trail leads to a very busy wallet (${short(last.address)}), probably an exchange or service.`);
    if (trail.stoppedBecause.code === "history_limit") w("HISTORY_LIMIT", "info", `The ${label}'s trail reached the start of the data we can read, so the real source may be older.`);
    if (trail.stoppedBecause.code === "no_earlier_funding") w("NO_FUNDING_FOUND", "info", `The ${label}'s trail ended because no earlier SUI deposit could be found.`);
  }
  return out;
}

function describeTrail(who: string, trail: Trail): string[] {
  const lines: string[] = [];
  const ws = trail.wallets;
  ws.forEach((wallet, i) => {
    const f = wallet.firstFunding;
    const name = i === 0 ? `${who} ${short(wallet.address)}` : `${wallet.isRelay ? "Relay wallet" : `Hop ${wallet.hop} wallet`} ${short(wallet.address)}`;
    const tag = wallet.exchange ? ` (${wallet.exchange})` : wallet.isBusy ? " (very busy wallet)" : "";
    if (f) {
      lines.push(`${name}${tag} got its first ${sui(f.amountSui)} SUI from ${short(f.from)} on ${f.at.slice(0, 19).replace("T", " ")} UTC.`);
    } else {
      lines.push(`${name}${tag}: no earlier SUI deposit found.`);
    }
  });
  lines.push(`Trail stopped: ${trail.stoppedBecause.message}`);
  return lines;
}

function buildSummary(r: TraceResult): string[] {
  const coin = r.coin.symbol ?? r.coin.name ?? short(r.coin.packageId);
  const lines = [`${coin} was published by ${short(r.creator.address)} on ${r.creator.publishedAt.slice(0, 19).replace("T", " ")} UTC.`];
  lines.push(...describeTrail("Creator", r.trail));
  if (r.controllerTrail && r.creator.controller) {
    lines.push(`The mint key went to a different wallet, ${short(r.creator.controller)}:`);
    lines.push(...describeTrail("Controller", r.controllerTrail));
  }
  return lines;
}
