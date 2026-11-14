// Chess: the owner's chess.com games and ratings (public API, read only). Shared by
// /api/chess (which fetches and trims) and the Chess tab (which sums up the day).

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
  /** This month's and last month's games, oldest first. */
  games: ChessGame[];
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

// ---- The day (client) -----------------------------------------------------------------

/** The app's day on this device: 4 AM to 4 AM. Unix seconds. */
export function dayBounds(now = new Date()): { start: number; end: number } {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4);
  if (now.getHours() < 4) d.setDate(d.getDate() - 1);
  const start = Math.floor(d.getTime() / 1000);
  return { start, end: start + 86_400 };
}

export interface DayClass {
  played: number;
  win: number;
  loss: number;
  draw: number;
  /** Rated rating change today: last rating today minus the last one before today. Null if unknown. */
  change: number | null;
}

/** Today's games per time control, with the rating change across the day's rated games. */
export function daySummary(games: ChessGame[], start: number, end: number): Record<ChessClass, DayClass> {
  const out = {} as Record<ChessClass, DayClass>;
  for (const { key } of CLASSES) {
    const mine = games.filter((g) => g.cls === key).sort((a, b) => a.end - b.end);
    const today = mine.filter((g) => g.end >= start && g.end < end);
    const ratedToday = today.filter((g) => g.rated);
    const before = mine.filter((g) => g.rated && g.end < start).at(-1);
    out[key] = {
      played: today.length,
      win: today.filter((g) => g.outcome === "win").length,
      loss: today.filter((g) => g.outcome === "loss").length,
      draw: today.filter((g) => g.outcome === "draw").length,
      change: ratedToday.length && before ? ratedToday.at(-1)!.rating - before.rating : null,
    };
  }
  return out;
}

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
