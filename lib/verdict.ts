// Turns a finished trace into the result card: one headline and a short list of plain reasons.
// The raw warning codes never reach the page. No em dashes. Pure functions, no network.

import { fmtDate } from "./format";
import type { TraceWithMemory } from "./rugs";

export type Verdict = {
  level: "linked" | "signs" | "none";
  headline: string;
  note: string | null; // one extra line under the headline
  reasons: string[];
};

type PastRug = { symbol: string | null; pulledAt: string | null };

const rugName = (r: PastRug) => `${r.symbol ?? "an earlier coin"} rug pull`;
const onDate = (r: PastRug) => (r.pulledAt ? ` (pulled on ${fmtDate(r.pulledAt)})` : "");

// Warnings that are about how the trail ended. The trail step explains these, so they are not reasons here.
const TRAIL_END_CODES = new Set(["FUNDED_BY_EXCHANGE", "FUNDED_BY_BUSY_WALLET", "HISTORY_LIMIT", "NO_FUNDING_FOUND"]);

// The warnings that already have their own sentence built from the matches.
const HANDLED_CODES = new Set(["MATCHES_PAST_RUG", "SAME_COIN_OBJECT_AS_PAST_RUG", "RELAY_CHAIN"]);

const SIGN_TEXT: Record<string, string> = {
  CREATOR_IS_BUSY_WALLET: "The wallet that published the coin is very busy. It may be a launch service and not the person behind the coin.",
  CONTROL_HANDED_OFF: "The wallet that published the coin gave control of it to a different wallet. That wallet may be the real owner.",
  SPONSORED_PUBLISH: "Someone else paid the fee to publish this coin.",
  FRESH_CREATOR_WALLET: "The creator's wallet was brand new. It was less than 24 hours old when it published the coin.",
  TYPE_DEFINED_IN_UPGRADE: "The coin was added in an update to its package, so the creator shown may not be the one who added it.",
};

export function buildVerdict(t: TraceWithMemory): Verdict {
  const reasons: string[] = [];

  if (t.alreadyConfirmedRug) {
    reasons.push("This coin is itself one of the rug pulls Revenant remembers.");
  }

  // The same SUI coin moved from a past rug pull to this creator: the strongest sign.
  const byCoin = new Map<string, { rug: PastRug; n: number }>();
  for (const m of t.coinObjectMatches) {
    const key = m.pastRug.symbol ?? m.pastRug.coinType;
    const e = byCoin.get(key);
    if (e) e.n += 1;
    else byCoin.set(key, { rug: m.pastRug, n: 1 });
  }
  for (const { rug } of byCoin.values()) {
    reasons.push(`The creator was paid with money that came out of the ${rugName(rug)}${onDate(rug)}. The same SUI coin moved from that pull to the creator's wallet.`);
  }

  // Wallets in the trail that were also seen in a past rug pull.
  const byRug = new Map<string, { rug: PastRug; wallets: Set<string> }>();
  for (const m of t.rugMatches) {
    for (const p of m.pastRugs) {
      const key = p.symbol ?? p.coinType;
      const e = byRug.get(key) ?? { rug: p, wallets: new Set<string>() };
      e.wallets.add(m.address);
      byRug.set(key, e);
    }
  }
  for (const { rug, wallets } of byRug.values()) {
    const n = wallets.size;
    reasons.push(`${n === 1 ? "1 wallet" : `${n} wallets`} in the trail of the creator's money ${n === 1 ? "is" : "are"} linked to the ${rugName(rug)}${onDate(rug)}.`);
  }

  const relay = t.warnings.find((w) => w.code === "RELAY_CHAIN");
  if (relay) {
    const n = /passed through (\d+) other wallets/.exec(relay.message)?.[1];
    reasons.push(
      `The creator's money passed through ${n ? `${n} other wallets` : "many other wallets"} in a row. Each one held it for only seconds or minutes, then sent it on. This is a common way to hide where money came from.`,
    );
  }

  const linked = t.alreadyConfirmedRug || byCoin.size > 0 || byRug.size > 0 || !!relay;

  const signs: string[] = [];
  for (const w of t.warnings) {
    if (HANDLED_CODES.has(w.code) || TRAIL_END_CODES.has(w.code)) continue;
    signs.push(SIGN_TEXT[w.code] ?? w.message);
  }
  reasons.push(...signs);

  if (linked) {
    return { level: "linked", headline: "This coin is linked to rug pulls we know", note: null, reasons };
  }
  if (signs.length > 0) {
    return { level: "signs", headline: "We found some warning signs", note: null, reasons };
  }
  return {
    level: "none",
    headline: "No links to rug pulls we know",
    note: "This does not mean the coin is safe. We only know about the rug pulls we have caught.",
    reasons: [],
  };
}
