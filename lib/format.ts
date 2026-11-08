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
  if (seconds < 90) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
};

export const fmtClock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
// "2 h 31 min 08 sec" for a number of milliseconds (numbers and units kept together)
export const fmtElapsed = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 3600)} h ${pad(Math.floor((t % 3600) / 60))} min ${pad(t % 60)} sec`;
};
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const numberWord = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));

// "20 h 41 min" (no seconds), for a gap that has stopped counting
export const fmtElapsedShort = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(t / 60)} h ${pad(t % 60)} min`;
};
// "6 Nov"
export const fmtDay = (iso: string) => fmtDate(iso).slice(0, -5);
