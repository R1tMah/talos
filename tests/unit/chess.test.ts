import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLASSES, dayBounds, dayBoundsOf, dayRecord, daySummary, earliestDay, fmtChange, fmtRecord, monthsFor, outcomeOf, parseMonths, rangeSummary, trimGame,
  type ApiGame, type ChessGame,
} from "@/lib/chess";
import { HOME_CARDS } from "@/lib/homeCards";

const api = (over: Partial<ApiGame> = {}): ApiGame => ({
  url: "https://www.chess.com/game/live/1", end_time: 1000, time_class: "blitz", rated: true, rules: "chess",
  white: { username: "ChessM12326", rating: 1836, result: "win" },
  black: { username: "someone", rating: 1800, result: "resigned" },
  ...over,
});

describe("Chess: time controls", () => {
  it("lists Rapid, Blitz, Bullet in that order, on the tab; Home shows Rapid, Blitz and Rapid.s change today", () => {
    expect(CLASSES.map((c) => c.label)).toEqual(["Rapid", "Blitz", "Bullet"]);
    expect(HOME_CARDS.find((c) => c.key === "chess")!.rows.map((r) => r.key)).toEqual(["rapid", "blitz", "rapidChange"]);
  });
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
    expect(day.blitz).toEqual({ played: 3, win: 1, loss: 1, draw: 1, rated: 3, change: 2, rating: 1802 });
    expect(day.bullet).toEqual({ played: 1, win: 1, loss: 0, draw: 0, rated: 0, change: null, rating: null });
    expect(day.rapid).toEqual({ played: 0, win: 0, loss: 0, draw: 0, rated: 0, change: null, rating: null });
  });

  it("can't tell a change without a game before today", () => {
    expect(daySummary([g(150, "rapid", 1774)], 100, 200).rapid.change).toBeNull();
  });

  it("sums today's wins, losses and draws across rapid, blitz and bullet", () => {
    const games = [
      g(50, "rapid", 1700, "win"), // yesterday
      g(100, "rapid", 1710, "win"), // the day's first second counts
      g(120, "blitz", 1800, "loss"),
      g(130, "bullet", 1900, "draw", false), // unrated still counts
      g(140, "bullet", 1890, "loss"),
      g(199, "blitz", 1810, "win"),
      g(200, "blitz", 1820, "win"), // the next day starts here
    ];
    expect(dayRecord(games, 100, 200)).toEqual({ win: 2, loss: 2, draw: 1 });
    expect(fmtRecord(dayRecord(games, 100, 200))).toBe("2-2");
    expect(fmtRecord(dayRecord(games, 100, 200), true)).toBe("2-2-1");
  });

  it("is 0-0 with no games today", () => {
    expect(fmtRecord(dayRecord([], 100, 200))).toBe("0-0");
    expect(fmtRecord(dayRecord([g(50, "rapid", 1700)], 100, 200))).toBe("0-0");
  });

  it("formats changes", () => {
    expect([fmtChange(12), fmtChange(-8), fmtChange(0)]).toEqual(["+12", "−8", "±0"]);
  });
});

describe("Chess: any day's bounds, on a New York device", () => {
  // The bounds use the device's wall clock; pin it so daylight saving is tested the same everywhere.
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  const iso = (sec: number) => new Date(sec * 1000).toISOString();

  it("runs 04:00 that day to 04:00 the next", () => {
    const { start, end } = dayBoundsOf("2026-11-20");
    expect(iso(start)).toBe("2026-11-20T09:00:00.000Z"); // 04:00 EST
    expect(iso(end)).toBe("2026-11-21T09:00:00.000Z");
  });

  // Clocks fall back at 02:00 on Nov 1, 2026 and spring forward at 02:00 on Mar 8, 2026: inside
  // the 4 AM days of Oct 31 and Mar 7.
  it("runs 25 hours across the fall-back night (Nov 1, 2026) and 23 across spring forward (Mar 8, 2026)", () => {
    const fall = dayBoundsOf("2026-10-31");
    expect(iso(fall.start)).toBe("2026-10-31T08:00:00.000Z"); // 04:00 EDT
    expect(iso(fall.end)).toBe("2026-11-01T09:00:00.000Z"); // 04:00 EST
    expect(fall.end - fall.start).toBe(25 * 3600);
    const nov1 = dayBoundsOf("2026-11-01");
    expect(nov1.start).toBe(fall.end); // back to back
    expect(iso(nov1.end)).toBe("2026-11-02T09:00:00.000Z");
    expect(nov1.end - nov1.start).toBe(24 * 3600);
    const spring = dayBoundsOf("2026-03-07");
    expect(iso(spring.end)).toBe("2026-03-08T08:00:00.000Z"); // 04:00 EDT
    expect(spring.end - spring.start).toBe(23 * 3600);
  });

  it("today's bounds are the logical day's: 03:30 after fall back is still Oct 31", () => {
    expect(dayBounds(new Date("2026-11-01T08:30:00Z"))).toEqual(dayBoundsOf("2026-10-31")); // 03:30 EST
    expect(dayBounds(new Date("2026-11-01T09:00:00Z"))).toEqual(dayBoundsOf("2026-11-01")); // 04:00 EST
  });

  it("the day bar stops at the first day starting inside the oldest of the 24 archives", () => {
    // Nov 2026 and 23 months back: December 2024 (UTC). Its first instant is 19:00 Nov 30 in
    // New York, so the first whole 4 AM day inside it is Dec 1.
    expect(earliestDay(new Date("2026-11-25T15:00:00Z"))).toBe("2024-12-01");
    expect(monthsFor(dayBoundsOf("2024-12-01").start, new Date("2026-11-25T15:00:00Z"))).toBe(24);
  });
});

describe("Chess: a range (a week)", () => {
  const g = (end: number, cls: ChessGame["cls"], rating: number, outcome: ChessGame["outcome"] = "win", rated = true): ChessGame => ({
    url: `u${end}${cls}`, end, cls, rated, color: "white", outcome, rating, opp: "x", oppRating: 1500,
  });
  const games = [
    g(50, "rapid", 1700), // before the week: the baseline
    g(60, "blitz", 1800),
    g(150, "rapid", 1712, "win"), // Monday
    g(400, "rapid", 1705, "loss"), // Thursday
    g(500, "rapid", 1690, "draw", false), // unrated: counted, rating unchanged
    g(650, "blitz", 1810, "win", false), // only unrated blitz this week
    g(700, "rapid", 1750), // next week starts at 700
  ];

  it("counts the range's games per class and the rated change from before it to its last rated game", () => {
    const week = rangeSummary(games, 100, 700);
    expect(week.rapid).toEqual({ played: 3, win: 1, loss: 1, draw: 1, rated: 2, change: 5, rating: 1750 });
    expect(week.blitz).toEqual({ played: 1, win: 1, loss: 0, draw: 0, rated: 0, change: null, rating: 1800 });
    expect(week.bullet).toEqual({ played: 0, win: 0, loss: 0, draw: 0, rated: 0, change: null, rating: null });
  });

  it("gives the rating at the end of the range, carried from before it when it has no rated games", () => {
    expect(rangeSummary(games, 100, 300).rapid.rating).toBe(1712);
    expect(rangeSummary(games, 450, 600).rapid).toMatchObject({ played: 1, change: null, rating: 1705 });
    expect(rangeSummary(games, 0, 40).rapid.rating).toBeNull(); // nothing yet
    // Rated games with nothing before them: counted as rated, change unknown.
    expect(rangeSummary(games, 0, 100).rapid).toMatchObject({ played: 1, rated: 1, change: null, rating: 1700 });
    expect(rangeSummary(games, 100, 699).rapid.rating).toBe(1705);
    expect(rangeSummary(games, 100, 700).rapid.rating).toBe(1750); // a game at exactly `end` counts: the rating at or before it
  });

  it("is the same as daySummary for a day", () => {
    expect(daySummary(games, 100, 700)).toEqual(rangeSummary(games, 100, 700));
  });
});

describe("Chess: how many monthly archives", () => {
  it("reads ?months= as a whole number from 2 to 24, defaulting to 2", () => {
    expect(parseMonths(null)).toBe(2);
    expect(parseMonths("")).toBe(2);
    expect(parseMonths("abc")).toBe(2);
    expect(parseMonths("0")).toBe(2);
    expect(parseMonths("-5")).toBe(2);
    expect(parseMonths("3")).toBe(3);
    expect(parseMonths("7.9")).toBe(2); // decimal digits only
    expect(parseMonths("0x10")).toBe(2);
    expect(parseMonths("1e2")).toBe(2);
    expect(parseMonths(" 5 ")).toBe(5);
    expect(parseMonths("24")).toBe(24);
    expect(parseMonths("1000")).toBe(24);
  });

  it("asks for the range's month and one before it, counted in UTC months", () => {
    const now = new Date("2026-11-25T15:00:00Z");
    const at = (s: string) => Date.parse(s) / 1000;
    expect(monthsFor(at("2026-11-23T09:00:00Z"), now)).toBe(2); // this month
    expect(monthsFor(at("2026-10-26T08:00:00Z"), now)).toBe(3); // last month
    expect(monthsFor(at("2026-08-03T08:00:00Z"), now)).toBe(5);
    expect(monthsFor(at("2025-12-29T09:00:00Z"), now)).toBe(13); // across a year
    expect(monthsFor(at("2023-01-02T09:00:00Z"), now)).toBe(24); // capped
  });
});
