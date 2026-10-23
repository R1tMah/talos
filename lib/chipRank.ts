// Which three tab chips Chat puts first right now, learned from when things get
// logged. Pure: the caller loads the history (lib/chipRankData.ts).
//
// Every save counts toward its tab; a message sent with a chip counts extra. An
// event counts more the closer its time of day is to now, the more recent it is,
// and when it happened on the same kind of day (weekday or weekend).

import type { ChatTab } from "./tabs";

export interface UseEvent {
  tab: ChatTab;
  at: Date;
  /** A message sent with this chip picked (vs. a save from anywhere). */
  chip: boolean;
}

export const LOOKBACK_DAYS = 56;
export const TOP = 3;
const WINDOW_MIN = 90; // ± minutes of time of day that still count
const HALF_LIFE_DAYS = 21; // an event 3 weeks old counts half
const CHIP_WEIGHT = 2;
const OTHER_DAY_TYPE = 0.25; // weekday events still count a little on weekends, and back
const BURST_MIN = 15; // several saves to one tab within this many minutes are one use
const MIN_SCORE = 0.5; // below this a tab isn't promoted: roughly one recent, close event

const DAY_MS = 86_400_000;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Logging six foods at lunch is one use of Nutrition, not six. Same for chip sends. */
function collapseBursts(events: UseEvent[]): UseEvent[] {
  const last = new Map<string, number>();
  const out: UseEvent[] = [];
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const k = `${e.tab}|${e.chip}`;
    const t = e.at.getTime();
    const prev = last.get(k);
    last.set(k, t);
    if (prev != null && t - prev < BURST_MIN * 60_000) continue;
    out.push(e);
  }
  return out;
}

/** Each tab's score for `now`. Tabs with no nearby use are left out. */
export function scoreChips(events: UseEvent[], now: Date): Map<ChatTab, number> {
  const scores = new Map<ChatTab, number>();
  const nowMin = minuteOfDay(now);
  const weekend = isWeekend(now);
  for (const e of collapseBursts(events)) {
    const age = (now.getTime() - e.at.getTime()) / DAY_MS;
    if (age < 0 || age > LOOKBACK_DAYS) continue;
    const diff = Math.abs(minuteOfDay(e.at) - nowMin);
    const dist = Math.min(diff, 1440 - diff); // 11:50pm is close to 12:10am
    if (dist > WINDOW_MIN) continue;
    const s =
      (1 - dist / (WINDOW_MIN + 1)) *
      0.5 ** (age / HALF_LIFE_DAYS) *
      (e.chip ? CHIP_WEIGHT : 1) *
      (isWeekend(e.at) === weekend ? 1 : OTHER_DAY_TYPE);
    scores.set(e.tab, (scores.get(e.tab) ?? 0) + s);
  }
  return scores;
}

/**
 * Up to three tabs to put first, best first, from the ones shown. Fewer when there
 * isn't enough history near this time; ties keep the usual chip order.
 */
export function topChips(events: UseEvent[], now: Date, shown: readonly ChatTab[]): ChatTab[] {
  const scores = scoreChips(events, now);
  return shown
    .map((tab, i) => ({ tab, i, s: scores.get(tab) ?? 0 }))
    .filter((x) => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, TOP)
    .map((x) => x.tab);
}

/** The chips in display order: the top ones first, then the rest in their usual order. */
export function orderChips<T extends { key: ChatTab }>(chips: readonly T[], top: readonly ChatTab[]): { first: T[]; rest: T[] } {
  const first = top.map((k) => chips.find((c) => c.key === k)).filter((c): c is T => !!c);
  return { first, rest: chips.filter((c) => !top.includes(c.key)) };
}
