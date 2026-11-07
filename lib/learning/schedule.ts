// Learning schedules. Pure: no Supabase, no clock (today is passed in).
//
// A cadence is a set of weekdays (0 = Sunday … 6 = Saturday). Unfinished modules always
// sit on the next cadence days, in order: the first one today if today is a cadence day
// and no module was finished today, otherwise the next cadence day. So a missed day
// shifts everything later, and finishing early pulls the rest forward.

import { addDays } from "@/lib/date";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 0–6 for an ISO date (read at noon, so no timezone can move it to another day). */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();

// Words for each day, longest first so "thursday" wins over "thu" and "th".
const DAY_WORDS: [RegExp, number][] = [
  [/\bsun(?:day)?s?\b/, 0], [/\bmon(?:day)?s?\b/, 1], [/\btue(?:s(?:day)?)?s?\b/, 2], [/\bwed(?:nesday)?s?\b/, 3],
  [/\bthu(?:r(?:s(?:day)?)?)?s?\b/, 4], [/\bfri(?:day)?s?\b/, 5], [/\bsat(?:urday)?s?\b/, 6],
];
const LETTERS: Record<string, number> = { su: 0, m: 1, t: 2, tu: 2, w: 3, th: 4, r: 4, f: 5, sa: 6, s: 6 };

/**
 * Weekdays from the owner's words: "Mondays, Wednesdays, and Fridays", "MWF", "TTh",
 * "tue/thu", "weekdays", "weekends", "daily". Null when no day can be read.
 */
export function parseCadence(text: string): number[] | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/\b(daily|every\s*day|everyday|7\s*days)\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set<number>();
  if (/\bweekdays?\b/.test(t)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  if (/\bweekends?\b/.test(t)) [0, 6].forEach((d) => days.add(d));
  for (const [re, d] of DAY_WORDS) if (re.test(t)) days.add(d);
  // Letter shorthand, one token like "mwf", "tth", "mtwrf".
  if (!days.size && /^[a-z]+$/.test(t.replace(/[\s/,&+-]/g, ""))) {
    const s = t.replace(/[\s/,&+-]/g, "");
    let i = 0;
    while (i < s.length) {
      const two = s.slice(i, i + 2);
      if (two in LETTERS && two.length === 2) { days.add(LETTERS[two]); i += 2; continue; }
      if (s[i] in LETTERS) { days.add(LETTERS[s[i]]); i += 1; continue; }
      return null;
    }
  }
  return days.size ? [...days].sort((a, b) => a - b) : null;
}

/** "Mon, Wed, Fri", "Every day", "Weekdays". */
export function cadenceLabel(days: readonly number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Weekdays";
  if (s.join() === "0,6") return "Weekends";
  return s.map((d) => SHORT[d]).join(", ");
}

/** The first cadence day on or after `from`. */
export function nextCadenceDay(cadence: readonly number[], from: string): string {
  let d = from;
  for (let i = 0; i < 7; i++, d = addDays(d, 1)) if (cadence.includes(weekdayOf(d))) return d;
  throw new Error("empty cadence");
}

/**
 * Dates for `count` unfinished modules, in order. The first is today when today is a
 * cadence day and nothing was finished today; otherwise the next cadence day.
 */
export function planDates(cadence: readonly number[], today: string, count: number, finishedToday: boolean): string[] {
  const out: string[] = [];
  let d = nextCadenceDay(cadence, finishedToday ? addDays(today, 1) : today);
  for (let i = 0; i < count; i++) {
    out.push(d);
    d = nextCadenceDay(cadence, addDays(d, 1));
  }
  return out;
}

// ---- Timeline ("finish by") ---------------------------------------------------------------

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * An end date from the owner's words, relative to today: "6 weeks", "in 3 weeks",
 * "2 months", "10 days", "Dec 20", "December 20th", "12/20", "2026-12-20". Null if it
 * can't be read or isn't after today. A month and day already past mean next year.
 */
export function parseTimeline(text: string, today: string): string | null {
  const t = text.trim().toLowerCase().replace(/^(?:in|within|by|over|for)\s+/, "");
  if (!t) return null;
  let out: string | null = null;
  const span = t.match(/^(\d+|a|an|one|two|three|four|five|six|eight|ten|twelve)\s*(day|week|wk|month|mo)s?$/);
  if (span) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
    const n = /^\d+$/.test(span[1]) ? Number(span[1]) : words[span[1]];
    const unit = span[2];
    if (unit === "day") out = addDays(today, n);
    else if (unit === "week" || unit === "wk") out = addDays(today, n * 7);
    else {
      const d = new Date(`${today}T12:00:00`);
      d.setMonth(d.getMonth() + n);
      out = d.toISOString().slice(0, 10);
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    out = t;
  } else {
    const year = Number(today.slice(0, 4));
    const pad = (n: number) => String(n).padStart(2, "0");
    let month = -1, day = -1;
    const named = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/);
    const slash = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    let y: number | null = null;
    if (named) {
      month = MONTH_NAMES.indexOf(named[1].slice(0, 3));
      day = Number(named[2]);
      y = named[3] ? Number(named[3]) : null;
    } else if (slash) {
      month = Number(slash[1]) - 1;
      day = Number(slash[2]);
      y = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
    }
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    out = `${y ?? year}-${pad(month + 1)}-${pad(day)}`;
    if (!y && out <= today) out = `${year + 1}-${pad(month + 1)}-${pad(day)}`;
    // Reject dates like Feb 30 that roll over.
    if (new Date(`${out}T12:00:00`).getDate() !== day) return null;
  }
  return out && out > today ? out : null;
}

/** Cadence days from `from` through `to`, both included. */
export function sessionsBetween(cadence: readonly number[], from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (cadence.includes(weekdayOf(d))) n++;
  return n;
}

export interface SchedModule {
  id: string;
  position: number;
  completedOn: string | null; // logical date it was finished, or null
  replaced: boolean;
}

/** Each live unfinished module's date, by id. Finished and replaced modules get none. */
export function scheduleModules(cadence: readonly number[], today: string, modules: readonly SchedModule[]): Map<string, string> {
  const live = modules.filter((m) => !m.replaced);
  const pending = live.filter((m) => !m.completedOn).sort((a, b) => a.position - b.position);
  const dates = planDates(cadence, today, pending.length, live.some((m) => m.completedOn === today));
  return new Map(pending.map((m, i) => [m.id, dates[i]]));
}
