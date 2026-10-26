// Spending tracking: what the owner spends, by hand or from chat, out of curiosity.
// Separate from the bank (lib/finances.ts). Pure: the Supabase side is lib/spendingData.ts.

/** The fixed categories (the database accepts exactly these). Chat picks one. */
export const SPEND_CATEGORIES = ["Food & drink", "Groceries", "Transport", "Shopping", "Entertainment", "School", "Health", "Other"] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];
export const isSpendCategory = (v: unknown): v is SpendCategory => SPEND_CATEGORIES.includes(v as SpendCategory);

export interface Spend {
  id: string;
  date: string;
  time: string; // entry time, for ordering within a day
  amount: number;
  what: string;
  category: SpendCategory;
  note: string | null;
}

/** Tracking starts here: nothing earlier counts, in either the month or the rolling view. */
export const SPENDING_SINCE = "2026-10-25";

const cents = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" for a date. */
export const monthOf = (date: string) => date.slice(0, 7);
/** "October 2026". */
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
/** The month before or after ("2026-01" back one is "2025-12"). */
export function shiftMonth(month: string, by: number) {
  const m = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
}
const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
/** Days from `from` through `to`, both included. */
const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/**
 * A month's spending from `since` on: the total, entries, an average per day so far (whole
 * month once it's over; days elapsed when it's the current month; both counted from `since`
 * in the month tracking began), and categories largest first.
 */
export function monthSummary(all: Spend[], month: string, today: string, since = SPENDING_SINCE) {
  const first = `${month}-01`;
  const start = first < since ? since : first;
  const end = month === monthOf(today) ? today : month < monthOf(today) ? `${month}-${String(daysIn(month)).padStart(2, "0")}` : "";
  const days = end && end >= start ? dayCount(start, end) : 0;
  return summarize(all.filter((s) => monthOf(s.date) === month && s.date >= since), days);
}

export const ROLLING_DAYS = 30;

/** The first day of the rolling window that ends today ("last 30 days" includes today), never before `since`. */
export function rollingStart(today: string, days = ROLLING_DAYS, since = SPENDING_SINCE) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  const from = d.toISOString().slice(0, 10);
  return from < since ? since : from;
}

/**
 * The last 30 days through today, whatever months they span, starting no earlier than
 * `since`. Per day is over the days actually in the window (1 on the first day, 30 once full).
 */
export function rollingSummary(all: Spend[], today: string, days = ROLLING_DAYS, since = SPENDING_SINCE) {
  const from = rollingStart(today, days, since);
  const span = from > today ? 0 : dayCount(from, today);
  return { from, days: span, ...summarize(all.filter((s) => s.date >= from && s.date <= today), span) };
}

function summarize(rows: Spend[], days: number) {
  const total = cents(rows.reduce((a, s) => a + s.amount, 0));
  const by = new Map<SpendCategory, number>();
  for (const s of rows) by.set(s.category, (by.get(s.category) ?? 0) + s.amount);
  const categories = [...by]
    .map(([category, amount]) => ({ category, amount: cents(amount), share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || SPEND_CATEGORIES.indexOf(a.category) - SPEND_CATEGORIES.indexOf(b.category));
  return { rows, total, count: rows.length, perDay: days ? cents(total / days) : null, categories };
}
