import { fromISO, todayISO } from "./date";
import type { Break } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Last day covered; ongoing breaks run through today. */
export const breakEnd = (b: Break, today = todayISO()) => b.end ?? today;

export const overlaps = (b: Break, from: string, to: string) => b.start <= to && breakEnd(b) >= from;

/** "Jul 16–18", "Jul 30–Aug 2", "Jul 16", "Jul 16–today". */
export function fmtRange(b: Break) {
  const s = fromISO(b.start);
  const head = `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  if (b.end == null) return `${head}–today`;
  if (b.end === b.start) return head;
  const e = fromISO(b.end);
  return e.getMonth() === s.getMonth() ? `${head}–${e.getDate()}` : `${head}–${MONTHS[e.getMonth()]} ${e.getDate()}`;
}
