// Builds the short plain summary at the top of each proof, from that coin's own facts.
// The sentence shapes change with the facts (how fast the pull was, whether the creator
// gained or lost, whether the money moved on to another creator), so no two coins read the same.
// No em dashes. Pure functions, no network.

import { fmtDate, fmtDateTime, fmtDuration, fmtSui } from "./format";
import type { BoardLink, BoardRug, BoardWatched } from "./board";

// "1 day 2 hours", "18 hours 30 min", "40 min"
export function fmtSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day");
  if (hours > 0) return m > 0 && hours < 10 ? `${plural(hours, "hour")} ${m} min` : plural(hours, "hour");
  return `${m} min`;
}

const sui = fmtSui; // "7,991 SUI"
const pick = <T,>(name: string, options: T[]): T => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
};

function linkSentences(name: string, out: BoardLink | undefined, inc: BoardLink | undefined): string {
  if (out && inc) {
    return `It sits in the middle of a chain. Money from the ${inc.from} pull reached its creator, and money from this pull went on to the creator of ${out.to}, through ${out.relayCount} other wallets in ${fmtDuration(out.seconds)}.`;
  }
  if (out) {
    return pick(name, [
      `One SUI coin from this pull went on to the creator of ${out.to}. It passed through ${out.relayCount} other wallets in ${fmtDuration(out.seconds)}.`,
      `The money did not stop there. The creator of ${out.to} was later paid with the same SUI coin, after ${out.relayCount} other wallets and ${fmtDuration(out.seconds)}.`,
    ]);
  }
  if (inc) {
    return `Its creator was paid with money from the ${inc.from} pull.`;
  }
  return ""; // no proven link: say nothing about links
}

export function rugSummary(rug: BoardRug, links: BoardLink[]): string {
  const name = rug.symbol;
  const out = links.find((l) => l.from === name);
  const inc = links.find((l) => l.to === name);
  const net = rug.suiTaken - rug.suiPutIn;
  const ex = rug.exchange;
  const pct = rug.coinsTakenBackPct !== null ? Math.round(rug.coinsTakenBackPct) : null;
  const ms = rug.pulledAt ? Date.parse(rug.pulledAt) - Date.parse(rug.publishedAt) : null;

  // 1. How long it lasted.
  let opener: string;
  if (ms === null) {
    opener = `${name} was launched on ${fmtDate(rug.publishedAt)}.`;
  } else if (ms < 24 * 3_600_000) {
    opener = pick(name, [`${name} lasted ${fmtSpan(ms)}.`, `${name} was gone after ${fmtSpan(ms)}.`, `${name} was live for ${fmtSpan(ms)} before the pull.`]);
  } else {
    opener = pick(name, [`${name} ran for ${fmtSpan(ms)}.`, `${name} stayed up for ${fmtSpan(ms)}, then the pool was emptied.`]);
  }

  // 2. What the creator did with the money. The two fixed sentences are always the same words; the order and the lead-in vary.
  const where = ex ? ` on ${ex}` : "";
  const coinsLine = pct !== null ? `${pct}% of all the coins were in the pool. The creator took them all back.` : "";
  let money: string;
  if (net <= 0) {
    money = [`The creator put in ${sui(rug.suiPutIn)} and took out ${sui(rug.suiTaken)}${where}. That is ${sui(-net)} less than it put in, but the pool was still emptied.`, coinsLine].filter(Boolean).join(" ");
  } else {
    const lead = pick(name, [
      `The creator put in ${sui(rug.suiPutIn)}, then took ${sui(rug.suiTaken)} out${where}.`,
      `Only ${sui(rug.suiPutIn)} had gone in, but ${sui(rug.suiTaken)} came out of the pool${where}.`,
      `${sui(rug.suiTaken)} came out of the pool${where}. The creator had paid in ${sui(rug.suiPutIn)}.`,
    ]);
    const extra = `The creator also took out ${sui(net)} more than it put in. That extra SUI came from buyers.`;
    money = (pick(name + "o", [true, false]) ? [lead, coinsLine, extra] : [lead, extra, coinsLine]).filter(Boolean).join(" ");
  }

  const when = rug.pulledAt ? fmtDateTime(rug.pulledAt) : null;
  const dateLine = when ? pick(name + "d", [`Pulled on ${when}.`, `The pull happened on ${when}.`, `This was on ${when}.`]) : "";
  const dateFirst = pick(name + "p", [true, false]);
  const link = linkSentences(name, out, inc);
  return (dateFirst ? [opener, dateLine, money, link] : [opener, money, dateLine, link]).filter(Boolean).join(" ");
}

export function watchedSummary(w: BoardWatched, links: BoardLink[], nowMs: number): string {
  const inc = links.find((l) => l.to === w.symbol);
  const parts: string[] = [];

  if (w.status === "pulled" && w.pull) {
    const ms = Date.parse(w.pull.at) - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} lasted ${fmtSpan(ms)}, then its creator took ${sui(w.pull.suiTaken)} out of the pool on ${fmtDateTime(w.pull.at)}.`);
    if (w.suiPutIn !== null) parts.push(`It had put in ${sui(w.suiPutIn)}.`);
  } else {
    const ms = nowMs - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} has been live for ${fmtSpan(ms)}.`);
    if (w.suiPutIn !== null) {
      parts.push(`Its creator put in ${sui(w.suiPutIn)} and has taken ${w.suiTakenOut ? sui(w.suiTakenOut) : "nothing"} out so far.`);
    }
    if (w.suiInPool !== null) parts.push(`About ${sui(w.suiInPool)} is still in the pool.`);
  }

  if (inc) {
    parts.push(`Its creator was paid with money from the ${inc.from} pull, through ${inc.relayCount} other wallets in ${fmtDuration(inc.seconds)}.`);
  }
  if (w.warning) {
    parts.push(
      w.status === "pulled" && w.pull?.hoursAfterWarning != null && w.pull.hoursAfterWarning >= 0
        ? `We saved a warning about it ${fmtSpan(w.pull.hoursAfterWarning * 3_600_000)} before the pull.`
        : `We saved a warning about it on ${fmtDateTime(w.warning.flaggedAt)}.`,
    );
  }
  if (w.status !== "pulled") parts.push("Revenant checks it every 10 minutes.");
  return parts.join(" ");
}
