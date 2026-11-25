// Chess: the owner's chess.com games and ratings (public API, read only). Shared by
// /api/chess (which fetches and trims) and the Chess tab (which sums up a day and a week).

import { addDays, logicalToday } from "./date";

export const CHESS_USERNAME = "ChessM12326";
export const CHESS_PROFILE = `https://www.chess.com/member/${CHESS_USERNAME}`;

/** The time controls the tab tracks, in the order shown. */
export const CLASSES = [
  { key: "rapid", label: "Rapid" },
  { key: "blitz", label: "Blitz" },
  { key: "bullet", label: "Bullet" },
] as const;
export type ChessClass = (typeof CLASSES)[number]["key"];
export const isChessClass = (v: unknown): v is ChessClass => CLASSES.some((c) => c.key === v);

export type Outcome = "win" | "loss" | "draw";

/** One finished game, from the owner's side. */
export interface ChessGame {
  url: string;
  end: number; // unix seconds
  cls: ChessClass;
  rated: boolean;
  color: "white" | "black";
  outcome: Outcome;
  rating: number; // the owner's rating after the game
  opp: string;
  oppRating: number;
}

export interface ClassStats {
  rating: number | null;
  best: number | null;
  record: { win: number; loss: number; draw: number } | null;
}

export interface ChessData {
  username: string;
  stats: Record<ChessClass, ClassStats>;
  /** The games in the last `months` monthly archives, oldest first. */
  games: ChessGame[];
  /** How many monthly archives (this month and earlier, UTC) `games` covers. */
  months: number;
  fetchedAt: string;
}

// ---- Reading chess.com's shapes (server) ---------------------------------------------

interface ApiSide {
  username: string;
  rating: number;
  result: string;
}
export interface ApiGame {
  url: string;
  end_time: number;
  time_class: string;
  rated: boolean;
  rules: string;
  white: ApiSide;
  black: ApiSide;
}

/** chess.com's per-side result as the owner's win, loss or draw. */
export function outcomeOf(me: string, them: string): Outcome {
  if (me === "win") return "win";
  if (them === "win") return "loss";
  return "draw"; // agreed, repetition, stalemate, insufficient, 50move, timevsinsufficient
}

/** A game the owner played in a tracked time control, or null (daily, variants, someone else's). */
export function trimGame(g: ApiGame, username = CHESS_USERNAME): ChessGame | null {
  if (g.rules !== "chess" || !isChessClass(g.time_class)) return null;
  const u = username.toLowerCase();
  const color = g.white?.username?.toLowerCase() === u ? "white" : g.black?.username?.toLowerCase() === u ? "black" : null;
  if (!color) return null;
  const me = g[color];
  const them = g[color === "white" ? "black" : "white"];
  return {
    url: g.url, end: g.end_time, cls: g.time_class, rated: g.rated, color,
    outcome: outcomeOf(me.result, them.result), rating: me.rating, opp: them.username, oppRating: them.rating,
  };
}

// ---- How much history (server and client) ---------------------------------------------

/** chess.com serves one archive per month; /api/chess fetches the last N (this month included). */
export const MONTHS_DEFAULT = 2;
export const MONTHS_MAX = 24;

/** The `?months=` param as a month count: decimal digits clamped to 2..24, else 2. */
export function parseMonths(raw: string | null): number {
  const n = raw != null && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return MONTHS_DEFAULT;
  return Math.min(MONTHS_MAX, Math.max(MONTHS_DEFAULT, n));
}

/**
 * How many months to fetch so a range starting at `start` (unix seconds) has its games
 * plus one earlier month (the first day's rating change needs a rating from before it).
 * Months count in UTC, like chess.com's archives.
 */
export function monthsFor(start: number, now = new Date()): number {
  const from = new Date(start * 1000);
  const back = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + now.getUTCMonth() - from.getUTCMonth();
  return Math.min(MONTHS_MAX, Math.max(MONTHS_DEFAULT, back + 2));
}

/**
 * The first day whose games the most /api/chess fetches (24 archives) still hold: the
 * first 4 AM day starting inside the oldest of those UTC months. The day bar stops there.
 */
export function earliestDay(now = new Date()): string {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_MAX - 1), 1) / 1000;
  const d = logicalToday(new Date(from * 1000));
  return dayBoundsOf(d).start < from ? addDays(d, 1) : d;
}

// ---- Days and weeks (client) ----------------------------------------------------------

/**
 * The app's day for a date ("YYYY-MM-DD") on this device: 04:00 local that day to 04:00
 * local the next, in unix seconds. Built from wall-clock dates, so the days clocks change
 * on run 23 or 25 hours.
 */
export function dayBoundsOf(iso: string): { start: number; end: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return {
    start: Math.floor(new Date(y, m - 1, d, 4).getTime() / 1000),
    end: Math.floor(new Date(y, m - 1, d + 1, 4).getTime() / 1000),
  };
}

/** Today on this device: 4 AM to 4 AM. Unix seconds. */
export const dayBounds = (now = new Date()) => dayBoundsOf(logicalToday(now));

export interface RangeClass {
  played: number;
  win: number;
  loss: number;
  draw: number;
  /** How many of the games were rated. */
  rated: number;
  /** Rated rating change across the range: the last rating in it minus the last one before it. Null if unknown. */
  change: number | null;
  /** The rating once the range is over: the last rated game's at or before `end`. Null if there's none. */
  rating: number | null;
}
export type DayClass = RangeClass;

/**
 * Games per time control ending in [start, end) (a day or a week), with the rated rating
 * change across them and the rating at `end`.
 */
export function rangeSummary(games: ChessGame[], start: number, end: number): Record<ChessClass, RangeClass> {
  const out = {} as Record<ChessClass, RangeClass>;
  for (const { key } of CLASSES) {
    const mine = games.filter((g) => g.cls === key).sort((a, b) => a.end - b.end);
    const inRange = mine.filter((g) => g.end >= start && g.end < end);
    const ratedIn = inRange.filter((g) => g.rated);
    const before = mine.filter((g) => g.rated && g.end < start).at(-1);
    out[key] = {
      played: inRange.length,
      win: inRange.filter((g) => g.outcome === "win").length,
      loss: inRange.filter((g) => g.outcome === "loss").length,
      draw: inRange.filter((g) => g.outcome === "draw").length,
      rated: ratedIn.length,
      change: ratedIn.length && before ? ratedIn.at(-1)!.rating - before.rating : null,
      rating: mine.filter((g) => g.rated && g.end <= end).at(-1)?.rating ?? null,
    };
  }
  return out;
}

/** One day's games per time control: rangeSummary over the day's bounds. */
export const daySummary = rangeSummary;

export interface WinLossDraw {
  win: number;
  loss: number;
  draw: number;
}

/** Wins, losses and draws across every tracked time control for games ending in [start, end). */
export function dayRecord(games: ChessGame[], start: number, end: number): WinLossDraw {
  const out: WinLossDraw = { win: 0, loss: 0, draw: 0 };
  for (const g of games) if (g.end >= start && g.end < end && isChessClass(g.cls)) out[g.outcome]++;
  return out;
}

/** "4-2" (wins, losses), or "4-2-1" with draws. Home leaves draws out; the Chess tab shows them. */
export const fmtRecord = (r: WinLossDraw, draws = false) => `${r.win}-${r.loss}${draws ? `-${r.draw}` : ""}`;

/** "+12", "−8", "±0". */
export const fmtChange = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
