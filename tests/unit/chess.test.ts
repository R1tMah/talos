import { describe, expect, it } from "vitest";
import { dayBounds, daySummary, fmtChange, outcomeOf, trimGame, type ApiGame, type ChessGame } from "@/lib/chess";

const api = (over: Partial<ApiGame> = {}): ApiGame => ({
  url: "https://www.chess.com/game/live/1", end_time: 1000, time_class: "blitz", rated: true, rules: "chess",
  white: { username: "ChessM12326", rating: 1836, result: "win" },
  black: { username: "someone", rating: 1800, result: "resigned" },
  ...over,
});

describe("Chess: reading chess.com games", () => {
  it("scores results from the owner's side", () => {
    expect(outcomeOf("win", "checkmated")).toBe("win");
    expect(outcomeOf("timeout", "win")).toBe("loss");
    expect(outcomeOf("resigned", "win")).toBe("loss");
    expect(outcomeOf("stalemate", "stalemate")).toBe("draw");
    expect(outcomeOf("agreed", "agreed")).toBe("draw");
  });

  it("keeps the owner's side whichever colour they played, any capitalisation", () => {
    expect(trimGame(api())).toMatchObject({ color: "white", outcome: "win", rating: 1836, opp: "someone", oppRating: 1800 });
    const asBlack = trimGame(api({
      white: { username: "someone", rating: 1900, result: "win" },
      black: { username: "chessm12326", rating: 1830, result: "timeout" },
    }));
    expect(asBlack).toMatchObject({ color: "black", outcome: "loss", rating: 1830 });
  });

  it("leaves out daily games, variants and games without the owner", () => {
    expect(trimGame(api({ time_class: "daily" }))).toBeNull();
    expect(trimGame(api({ rules: "chess960" }))).toBeNull();
    expect(trimGame(api({ white: { username: "a", rating: 1, result: "win" } }))).toBeNull();
  });
});

describe("Chess: the day", () => {
  it("runs 4 AM to 4 AM on this device", () => {
    const at = (h: number) => new Date(2026, 10, 6, h, 30);
    const { start, end } = dayBounds(at(15));
    expect(new Date(start * 1000)).toEqual(new Date(2026, 10, 6, 4));
    expect(end - start).toBe(86_400);
    // 1:30 AM still belongs to the day before.
    expect(new Date(dayBounds(at(1)).start * 1000)).toEqual(new Date(2026, 10, 5, 4));
  });

  const g = (end: number, cls: ChessGame["cls"], rating: number, outcome: ChessGame["outcome"] = "win", rated = true): ChessGame => ({
    url: `u${end}${cls}`, end, cls, rated, color: "white", outcome, rating, opp: "x", oppRating: 1500,
  });

  it("counts today's games and the rating change from where the day started", () => {
    const games = [
      g(50, "blitz", 1800), // yesterday: the starting point
      g(150, "blitz", 1810, "win"),
      g(160, "blitz", 1802, "loss"),
      g(170, "blitz", 1802, "draw"),
      g(180, "bullet", 1900, "win", false), // unrated: counted, no rating change
      g(300, "blitz", 1850), // tomorrow: not today
    ];
    const day = daySummary(games, 100, 200);
    expect(day.blitz).toEqual({ played: 3, win: 1, loss: 1, draw: 1, change: 2 });
    expect(day.bullet).toEqual({ played: 1, win: 1, loss: 0, draw: 0, change: null });
    expect(day.rapid).toEqual({ played: 0, win: 0, loss: 0, draw: 0, change: null });
  });

  it("can't tell a change without a game before today", () => {
    expect(daySummary([g(150, "rapid", 1774)], 100, 200).rapid.change).toBeNull();
  });

  it("formats changes", () => {
    expect([fmtChange(12), fmtChange(-8), fmtChange(0)]).toEqual(["+12", "−8", "±0"]);
  });
});
