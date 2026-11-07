// Watch's time-of-day order: which block is in effect, and the order it puts cards in.

import { describe, expect, it } from "vitest";
import { blockAt, orderByTime } from "@/lib/watch/schedule";

// Local times. Oct 23, 2026 is a Friday; Oct 24 a Saturday; Oct 26 a Monday.
const at = (day: number, hhmm: string) => new Date(2026, 9, day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));

describe("block of the day", () => {
  it.each([
    [23, "07:30", "Wake up", "08:00"],
    [23, "07:59", "Wake up", "08:00"],
    [23, "08:00", "Commute in", "09:30"],
    [23, "12:00", "Work", "18:00"],
    [23, "18:30", "Commute home", "19:00"],
    [23, "19:15", "Applying", "20:00"],
    [23, "22:00", "Evening", "07:30"],
    [26, "03:00", "Evening", "07:30"], // after midnight, last night's block continues
  ])("Oct %s %s -> %s until %s", (day, hhmm, name, until) => {
    expect(blockAt(at(day, hhmm))).toMatchObject({ block: { name }, until });
  });
  it("weekends are one block, with the Brews' late morning (10 to noon) in the middle", () => {
    expect(blockAt(at(24, "08:30"))).toMatchObject({ block: { name: "Weekend" }, until: "10:00" });
    expect(blockAt(at(24, "10:00"))).toMatchObject({ block: { name: "Late morning" }, until: "12:00" });
    expect(blockAt(at(25, "11:59")).block.name).toBe("Late morning");
    expect(blockAt(at(25, "12:00"))).toMatchObject({ block: { name: "Weekend" }, until: null });
    expect(blockAt(at(25, "19:30"))).toMatchObject({ block: { name: "Weekend" }, until: null });
  });
});

const cards = ["Green Line B", "Weather", "Morning Brew", "Tech Brew", "Trail Blazers", "NFL", "New-grad jobs", "Calendar"]
  .map((title, position) => ({ title, position }));
const names = (now: Date, list = cards) => orderByTime(list, now).map((c) => c.title);

describe("order", () => {
  it("the commute in puts the train and the Brews first", () => {
    expect(names(at(23, "08:15")).slice(0, 3)).toEqual(["Green Line B", "Morning Brew", "Tech Brew"]);
  });
  it("7 to 8pm puts jobs first, for applying on the train", () => {
    expect(names(at(23, "19:00"))[0]).toBe("New-grad jobs");
  });
  it("weekends drop calendar and the Brews low", () => {
    expect(names(at(24, "09:00"))).toEqual(["Weather", "Trail Blazers", "New-grad jobs", "Green Line B", "Calendar", "Morning Brew", "Tech Brew", "NFL"]);
    expect(names(at(25, "15:00"))).toEqual(["Weather", "Trail Blazers", "New-grad jobs", "Green Line B", "Calendar", "Morning Brew", "Tech Brew", "NFL"]);
  });
  it("weekend late mornings put the Brews first", () => {
    expect(names(at(24, "10:30")).slice(0, 3)).toEqual(["Morning Brew", "Tech Brew", "Weather"]);
    expect(names(at(25, "11:45")).at(-1)).toBe("NFL");
  });
  it("weekday mornings at the same time are unchanged", () => {
    expect(names(at(23, "10:30"))[0]).toBe("Calendar");
  });
  it("NFL is always last", () => {
    for (const t of ["07:45", "08:30", "13:00", "18:15", "19:30", "23:00"]) expect(names(at(23, t)).at(-1)).toBe("NFL");
  });
  it("cards the schedule doesn't list go after the listed ones, in their own order", () => {
    const extra = [...cards, { title: "Celtics", position: 9 }, { title: "Weather radar", position: 8 }];
    expect(names(at(23, "12:00"), extra).slice(-2)).toEqual(["Weather radar", "Celtics"]);
  });
  it("names match regardless of case and stray spaces", () => {
    expect(names(at(23, "08:15"), [{ title: " green line b ", position: 5 }, { title: "nfl", position: 0 }])).toEqual([" green line b ", "nfl"]);
  });
});

describe("pinned and sunk sources", () => {
  const srcs = [...cards, { title: "Extra", position: cards.length }];
  it("a pinned source goes first and a sunk one last, whatever the block", () => {
    const now = new Date(2026, 9, 28, 8, 45); // weekday commute
    expect(orderByTime(srcs, now, (s) => s.title === "Extra")[0].title).toBe("Extra");
    expect(orderByTime(srcs, now, undefined, (s) => s.title === "Calendar").at(-1)!.title).toBe("Calendar");
  });
});
