const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export const toHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const nowHM = () => toHM(new Date());

export function addDays(s: string, n: number) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday of the week containing `s`. */
export function weekStart(s: string) {
  const d = fromISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function fmtDay(s: string) {
  const d = fromISO(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export const fmtDow = (s: string) => DOWS[fromISO(s).getDay()];

export function fmtClock(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const newestFirst = (a: { date: string; time: string }, b: { date: string; time: string }) =>
  (b.date + b.time).localeCompare(a.date + a.time);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
