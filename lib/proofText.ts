// Builds the short plain summary at the top of each proof, from that coin's own facts.
// Two short sentences, plus one sentence when there is a proven link to another coin.
// No em dashes. Pure functions, no network.

import { fmtDate, fmtDateTime, fmtSui, fmtTime } from "./format";
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

// Whole numbers in short form: 448 million, 1 billion, 1.5 billion (cut down, never rounded up)
function shortNum(n: number): string {
  if (n >= 1e9) {
    const v = Math.floor((n / 1e9) * 10) / 10;
    return `${Number.isInteger(v) ? v : v.toFixed(1)} billion`;
  }
  if (n >= 1e6) return `${Math.floor(n / 1e6)} million`;
  if (n >= 1e3) return `${Math.floor(n / 1e3)} thousand`;
  return String(Math.floor(n));
}
// Left out when the supply or the pool amount could not be read for this coin.
const tokenSentence = (name: string, t: { removed: number; supply: number } | null) =>
  t && t.supply > 0 ? `The pull took ${shortNum(t.removed)} (${Math.round((t.removed / t.supply) * 100)}%) of ${name}'s ${shortNum(t.supply)} tokens out of the pool, leaving buyers with no pool to sell into.` : "";

// The proven links on either side of this coin (one sentence each), or nothing when there is none.
function linkSentence(name: string, links: BoardLink[]): string {
  const out = links.find((l) => l.from === name);
  const inc = links.find((l) => l.to === name);
  const parts: string[] = [];
  if (inc) parts.push(`${inc.from}'s money was sent to the wallet that launched ${name}.`);
  if (out) parts.push(`${name}'s money was sent to the wallet that launched ${out.to}.`);
  return parts.join(" ");
}

// "[COIN] was rug pulled on [date], [time] after it launched, on [exchange]. The creator put in [X] and took out [Y]."
export function rugSummary(rug: BoardRug, links: BoardLink[]): string {
  const name = rug.symbol;
  const lasted = rug.pulledAt ? `, ${fmtSpan(Date.parse(rug.pulledAt) - Date.parse(rug.publishedAt))} after the token launched` : "";
  const first = rug.pulledAt ? `${name} was rug pulled on ${fmtDate(rug.pulledAt)} at ${fmtTime(rug.pulledAt)}${lasted}${rug.exchange ? `, on ${rug.exchange}` : ""}.` : `${name} was launched on ${fmtDate(rug.publishedAt)}.`;
  const second = `The creator put in ${sui(rug.suiPutIn)} and took out ${sui(rug.suiTaken)}.`;
  return [first, second, tokenSentence(name, rug.pullTokens), linkSentence(name, links)].filter(Boolean).join(" ");
}

export function watchedSummary(w: BoardWatched, links: BoardLink[], nowMs: number): string {
  const parts: string[] = [];
  if (w.status === "pulled" && w.pull) {
    const ms = Date.parse(w.pull.at) - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} was rug pulled on ${fmtDate(w.pull.at)} at ${fmtTime(w.pull.at)}, ${fmtSpan(ms)} after the token launched.`);
    parts.push(`The creator put in ${sui(w.suiPutIn ?? 0)} and took out ${sui(w.pull.suiTaken)}.`);
    const tk = tokenSentence(w.symbol, w.pullTokens);
    if (tk) parts.push(tk);
  } else {
    const ms = nowMs - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} has been live for ${fmtSpan(ms)}.`);
    if (w.suiPutIn !== null) {
      parts.push(`The creator put in ${sui(w.suiPutIn)} and has taken ${w.suiTakenOut ? sui(w.suiTakenOut) : "nothing"} out so far.`);
    }
    if (w.suiInPool !== null) parts.push(`About ${sui(w.suiInPool)} is still in the pool.`);
  }
  const link = linkSentence(w.symbol, links);
  if (link) parts.push(link);
  if (w.warning) {
    parts.push(
      w.status === "pulled" && w.pull?.hoursAfterWarning != null && w.pull.hoursAfterWarning >= 0
        ? `We saved a warning about the token ${fmtSpan(w.pull.hoursAfterWarning * 3_600_000)} before the pull.`
        : `We saved a warning about the token on ${fmtDateTime(w.warning.flaggedAt)}.`,
    );
  }
  if (w.status !== "pulled") parts.push("Revenant checks the token every 10 minutes.");
  return parts.join(" ");
}
