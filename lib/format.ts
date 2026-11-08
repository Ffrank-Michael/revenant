// Small, predictable formatters (always UTC, always English) so the page reads the same everywhere.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtShortDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].toUpperCase()}`;
};
export const fmtSui = (n: number) => `${Math.round(n).toLocaleString("en-US")} SUI`;
export const fmtDuration = (seconds: number) => {
  if (seconds < 90) return `${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
};

export const fmtClock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
// "2h 31m 08s" for a number of milliseconds
export const fmtElapsed = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 3600)}h ${pad(Math.floor((t % 3600) / 60))}m ${pad(t % 60)}s`;
};
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const numberWord = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
