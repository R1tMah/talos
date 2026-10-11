import { addDays, todayISO, weekStart } from "./date";
import type { FoodEntry, WeightEntry, Workout } from "./types";

export const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** One value per logged day (multiple weigh-ins on a day are averaged). */
export function dailyWeights(entries: WeightEntry[]) {
  const byDay = new Map<string, number[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.lb]);
  return new Map([...byDay].map(([d, xs]) => [d, mean(xs)!]));
}

export interface WeekRow {
  id: string;
  week: string;
  avg: number;
  days: number;
  partial: boolean;
}

/** Weekly averages of daily values, newest week first. */
export function weeklyWeights(entries: WeightEntry[]): WeekRow[] {
  const byWeek = new Map<string, number[]>();
  for (const [day, lb] of dailyWeights(entries)) {
    const w = weekStart(day);
    byWeek.set(w, [...(byWeek.get(w) ?? []), lb]);
  }
  return [...byWeek]
    .map(([week, xs]) => ({ id: week, week, avg: mean(xs)!, days: xs.length, partial: xs.length < 7 }))
    .sort((a, b) => b.week.localeCompare(a.week));
}

export function weekSummary(entries: WeightEntry[], week: string) {
  const end = addDays(week, 6);
  const days = [...dailyWeights(entries)].filter(([d]) => d >= week && d <= end).map(([, lb]) => lb);
  return { avg: mean(days), days: days.length };
}

export function dayTotals(food: FoodEntry[], date: string) {
  return food
    .filter((e) => e.date === date)
    .reduce((t, e) => ({ cal: t.cal + e.cal, p: t.p + e.p, c: t.c + e.c, f: t.f + e.f }), { cal: 0, p: 0, c: 0, f: 0 });
}

export function countBy<T>(xs: T[], key: (x: T) => string) {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
}

export function inWeek<T extends { date: string }>(xs: T[], week = weekStart(todayISO())) {
  const end = addDays(week, 6);
  return xs.filter((x) => x.date >= week && x.date <= end);
}

export function lastWorkout(ws: Workout[]) {
  return [...ws].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
}
