// Builds the short plain summary at the top of each proof, from that coin's own facts.
// Two short sentences, plus one sentence when there is a proven link to another coin.
// No em dashes. Pure functions, no network.

import { fmtDate, fmtDateTime, fmtSui } from "./format";
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

// One sentence about a proven link, or nothing when there is none.
function linkSentence(name: string, links: BoardLink[]): string {
  const out = links.find((l) => l.from === name);
  if (out) return `That money was sent to the wallet that launched ${out.to}.`;
  const inc = links.find((l) => l.to === name);
  if (inc) return `Its creator was paid with money from ${inc.from}'s rug pull.`;
  return "";
}

// "[COIN] was rug pulled on [date], [time] after it launched, on [exchange]. The creator put in [X] and took out [Y]."
export function rugSummary(rug: BoardRug, links: BoardLink[]): string {
  const name = rug.symbol;
  const lasted = rug.pulledAt ? `, ${fmtSpan(Date.parse(rug.pulledAt) - Date.parse(rug.publishedAt))} after it launched` : "";
  const first = rug.pulledAt ? `${name} was rug pulled on ${fmtDate(rug.pulledAt)}${lasted}${rug.exchange ? `, on ${rug.exchange}` : ""}.` : `${name} was launched on ${fmtDate(rug.publishedAt)}.`;
  const second = `The creator put in ${sui(rug.suiPutIn)} and took out ${sui(rug.suiTaken)}.`;
  return [first, second, linkSentence(name, links)].filter(Boolean).join(" ");
}

export function watchedSummary(w: BoardWatched, links: BoardLink[], nowMs: number): string {
  const parts: string[] = [];
  if (w.status === "pulled" && w.pull) {
    const ms = Date.parse(w.pull.at) - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} was rug pulled on ${fmtDate(w.pull.at)}, ${fmtSpan(ms)} after it launched.`);
    parts.push(`The creator put in ${sui(w.suiPutIn ?? 0)} and took out ${sui(w.pull.suiTaken)}.`);
  } else {
    const ms = nowMs - Date.parse(w.publishedAt);
    parts.push(`${w.symbol} has been live for ${fmtSpan(ms)}.`);
    if (w.suiPutIn !== null) {
      parts.push(`Its creator put in ${sui(w.suiPutIn)} and has taken ${w.suiTakenOut ? sui(w.suiTakenOut) : "nothing"} out so far.`);
    }
    if (w.suiInPool !== null) parts.push(`About ${sui(w.suiInPool)} is still in the pool.`);
  }
  const link = linkSentence(w.symbol, links);
  if (link) parts.push(link);
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
