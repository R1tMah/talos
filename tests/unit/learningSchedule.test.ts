// Learning schedules: reading a cadence, and dating unfinished modules on it.

import { describe, expect, it } from "vitest";
import { cadenceLabel, parseCadence, parseTimeline, planDates, scheduleModules, sessionsBetween, weekdayOf } from "@/lib/learning/schedule";

describe("parseCadence", () => {
  it.each([
    ["Mondays, Wednesdays, and Fridays", [1, 3, 5]],
    ["MWF", [1, 3, 5]],
    ["mwf", [1, 3, 5]],
    ["TTh", [2, 4]],
    ["tue/thu", [2, 4]],
    ["Tuesday and Thursday", [2, 4]],
    ["weekdays", [1, 2, 3, 4, 5]],
    ["weekends", [0, 6]],
    ["daily", [0, 1, 2, 3, 4, 5, 6]],
    ["every day", [0, 1, 2, 3, 4, 5, 6]],
    ["sat sun", [0, 6]],
  ])("%s", (text, days) => expect(parseCadence(text)).toEqual(days));

  it("returns null when no day can be read", () => {
    expect(parseCadence("")).toBeNull();
    expect(parseCadence("whenever I feel like it")).toBeNull();
  });

  it("labels", () => {
    expect(cadenceLabel([5, 1, 3])).toBe("Mon, Wed, Fri");
    expect(cadenceLabel([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(cadenceLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });
});

describe("dates", () => {
  const MWF = [1, 3, 5];
  // 2026-11-09 is a Monday.
  it("starts today on a cadence day, else the next one", () => {
    expect(weekdayOf("2026-11-09")).toBe(1);
    expect(planDates(MWF, "2026-11-09", 3, false)).toEqual(["2026-11-09", "2026-11-11", "2026-11-13"]);
    expect(planDates(MWF, "2026-11-10", 2, false)).toEqual(["2026-11-11", "2026-11-13"]);
    expect(planDates(MWF, "2026-11-13", 2, false)).toEqual(["2026-11-13", "2026-11-16"]);
  });

  it("after finishing one today, the next waits for the next cadence day", () => {
    expect(planDates(MWF, "2026-11-11", 1, true)).toEqual(["2026-11-13"]);
  });

  const mod = (id: string, position: number, completedOn: string | null = null, replaced = false) => ({ id, position, completedOn, replaced });

  it("a missed day shifts the rest", () => {
    // Module 2 was due Wednesday; it's now Thursday and it isn't done.
    const s = scheduleModules(MWF, "2026-11-12", [mod("a", 1, "2026-11-09"), mod("b", 2), mod("c", 3)]);
    expect([...s]).toEqual([["b", "2026-11-13"], ["c", "2026-11-16"]]);
  });

  it("working ahead pulls the rest forward and skips finished and replaced modules", () => {
    const s = scheduleModules(MWF, "2026-11-09", [
      mod("a", 1, "2026-11-09"), mod("b", 2, "2026-11-09"), mod("old", 3, null, true), mod("c", 4), mod("d", 5),
    ]);
    expect([...s]).toEqual([["c", "2026-11-11"], ["d", "2026-11-13"]]);
  });
});

describe("timeline", () => {
  const today = "2026-11-09"; // Monday
  it.each([
    ["6 weeks", "2026-12-21"],
    ["in 3 weeks", "2026-11-30"],
    ["two weeks", "2026-11-23"],
    ["10 days", "2026-11-19"],
    ["2 months", "2027-01-09"],
    ["Dec 20", "2026-12-20"],
    ["December 20th", "2026-12-20"],
    ["by 12/20", "2026-12-20"],
    ["2026-12-20", "2026-12-20"],
    ["Jan 15", "2027-01-15"], // already past this year: next year
  ])("%s", (text, date) => expect(parseTimeline(text, today)).toBe(date));

  it("rejects what it can't read, impossible dates and dates not after today", () => {
    expect(parseTimeline("soon", today)).toBeNull();
    expect(parseTimeline("Feb 30", today)).toBeNull();
    expect(parseTimeline("2026-11-09", today)).toBeNull();
  });

  it("counts cadence sessions in a range, both ends included", () => {
    expect(sessionsBetween([1, 3, 5], "2026-11-09", "2026-11-20")).toBe(6);
    expect(sessionsBetween([1, 3, 5], "2026-11-10", "2026-11-10")).toBe(0);
  });
});
