// Watch's order by time of day: a fixed priority list per block of the owner's day,
// set from their routine (not learned). The whole list reorders when a block starts.
//
// Blocks are matched to cards by name (case-insensitive). Cards a block doesn't list
// go after the listed ones, in their usual order. Times are the phone's local time.

export interface Block {
  name: string;
  from: string; // "HH:MM", local; the block runs until the next one starts
  order: string[]; // card names, highest priority first
}

// Weekdays (Mon–Fri): wake at 7:30, train 8–9:30 (Brews on the train), work 9–7,
// train home 6–7:30, apply to jobs 7–8 on the train, then evening. Calendar leads
// whenever not commuting; NFL is always last.
export const WEEKDAY: Block[] = [
  { name: "Wake up", from: "07:30", order: ["Calendar", "Weather", "Green Line B", "New-grad jobs", "Trail Blazers", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Commute in", from: "08:00", order: ["Green Line B", "Morning Brew", "Tech Brew", "Weather", "Calendar", "New-grad jobs", "Trail Blazers", "NFL"] },
  { name: "Work", from: "09:30", order: ["Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "Green Line B", "NFL"] },
  { name: "Commute home", from: "18:00", order: ["Green Line B", "Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Applying", from: "19:00", order: ["New-grad jobs", "Green Line B", "Calendar", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Evening", from: "20:00", order: ["Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "Green Line B", "NFL"] },
];

// Weekends: no commute, no newsletters, calendar mostly ignored.
export const WEEKEND: Block[] = [
  { name: "Weekend", from: "00:00", order: ["Weather", "Trail Blazers", "New-grad jobs", "Green Line B", "Calendar", "Morning Brew", "Tech Brew", "NFL"] },
];

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The block in effect at `now`, and when it ends ("HH:MM", or null if it runs all day). */
export function blockAt(now: Date): { block: Block; until: string | null } {
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const blocks = weekend ? WEEKEND : WEEKDAY;
  const m = now.getHours() * 60 + now.getMinutes();
  // The last block that has started; before the first one, the previous night's block continues.
  const i = blocks.reduce((at, b, j) => (minutes(b.from) <= m ? j : at), blocks.length - 1);
  return { block: blocks[i], until: blocks.length > 1 ? blocks[(i + 1) % blocks.length].from : null };
}

/** Sources in the current block's order; unlisted ones after, by their own position. */
export function orderByTime<T extends { title: string; position: number }>(sources: readonly T[], now: Date): T[] {
  const { order } = blockAt(now).block;
  const rank = (s: T) => {
    const i = order.findIndex((name) => name.toLowerCase() === s.title.trim().toLowerCase());
    return i < 0 ? order.length : i;
  };
  return [...sources].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

/** "7:30 PM" from "19:30". */
export const fmtHHMM = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};
