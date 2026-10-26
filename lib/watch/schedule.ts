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

// System Design Prep (a temporary study plan) leads weekday evenings and sits near the
// top on weekends; in the weekday daytime blocks it isn't listed, so it goes last.
//
// Weekdays (Mon–Fri): wake at 7:30, train 8–9:30 (Brews on the train), work 9–7,
// train home 6–7:30, apply to jobs 7–8 on the train, then evening. Calendar leads
// whenever not commuting; NFL is always last.
export const WEEKDAY: Block[] = [
  { name: "Wake up", from: "07:30", order: ["Calendar", "Weather", "Green Line B", "New-grad jobs", "Trail Blazers", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Commute in", from: "08:00", order: ["Green Line B", "Morning Brew", "Tech Brew", "Weather", "Calendar", "New-grad jobs", "Trail Blazers", "NFL"] },
  { name: "Work", from: "09:30", order: ["Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "Green Line B", "NFL"] },
  { name: "Commute home", from: "18:00", order: ["Green Line B", "Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Applying", from: "19:00", order: ["New-grad jobs", "Green Line B", "Calendar", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "NFL"] },
  { name: "Evening", from: "20:00", order: ["System Design Prep", "Calendar", "New-grad jobs", "Trail Blazers", "Weather", "Morning Brew", "Tech Brew", "Green Line B", "NFL"] },
];

// Weekends: no commute, calendar mostly ignored. Waking up late, 10 to noon is when the
// Brews get read, so they lead then; the rest of the day they sit low.
const WEEKEND_ORDER = ["Weather", "System Design Prep", "Trail Blazers", "New-grad jobs", "Green Line B", "Calendar", "Morning Brew", "Tech Brew", "NFL"];
export const WEEKEND: Block[] = [
  { name: "Weekend", from: "00:00", order: WEEKEND_ORDER },
  { name: "Late morning", from: "10:00", order: ["Morning Brew", "Tech Brew", "System Design Prep", "Weather", "Trail Blazers", "New-grad jobs", "Green Line B", "Calendar", "NFL"] },
  { name: "Weekend", from: "12:00", order: WEEKEND_ORDER },
];

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The block in effect at `now`, and when it ends ("HH:MM", or null if it runs through the rest of the day). */
export function blockAt(now: Date): { block: Block; until: string | null } {
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const blocks = weekend ? WEEKEND : WEEKDAY;
  const m = now.getHours() * 60 + now.getMinutes();
  // The last block that has started; before the first one, the previous night's block continues.
  const i = blocks.reduce((at, b, j) => (minutes(b.from) <= m ? j : at), blocks.length - 1);
  const next = blocks[(i + 1) % blocks.length];
  // The weekend afternoon wraps back to its own block at midnight: that's no real end.
  return { block: blocks[i], until: next.name !== blocks[i].name ? next.from : null };
}

/** Morning study window: on a session day, the prep card goes above everything (news included). */
export const PREP_WINDOW = { from: "07:30", to: "09:30" };

export const inPrepWindow = (now: Date) => {
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= minutes(PREP_WINDOW.from) && m < minutes(PREP_WINDOW.to);
};

/**
 * Sources in the current block's order; unlisted ones after, by their own position.
 * `pinned` sources go first, ahead of the block's order (e.g. prep on a session morning);
 * `sunk` ones go last, below everything (e.g. prep on a day without a session).
 */
export function orderByTime<T extends { title: string; position: number }>(
  sources: readonly T[], now: Date, pinned?: (s: T) => boolean, sunk?: (s: T) => boolean,
): T[] {
  const { order } = blockAt(now).block;
  const rank = (s: T) => {
    if (pinned?.(s)) return -1;
    if (sunk?.(s)) return order.length + 1;
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
