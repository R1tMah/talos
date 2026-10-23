// Chat's tab chips: the three likeliest for this time of day go first.

import { describe, expect, it, vi } from "vitest";
import { orderChips, scoreChips, topChips, type UseEvent } from "@/lib/chipRank";
import { CHAT_TABS, type ChatTab } from "@/lib/tabs";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
const { tabOfSave } = await import("@/lib/chipRankData");

const ALL = CHAT_TABS.map((t) => t.key) as ChatTab[];
// Thu 2026-10-22 08:00 local; weekdays before it are Wed 21, Tue 20, Mon 19, Fri 16...
const NOW = new Date(2026, 9, 22, 8, 0);
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const save = (tab: ChatTab, d: Date): UseEvent => ({ tab, at: d, chip: false });
const chip = (tab: ChatTab, d: Date): UseEvent => ({ tab, at: d, chip: true });

/** One save per day at the given time, on each listed day. */
const daily = (tab: ChatTab, days: number[], h: number, m = 0) => days.map((d) => save(tab, at(d, h, m)));
const WEEKDAYS = [13, 14, 15, 16, 19, 20, 21];

describe("topChips", () => {
  it("puts what you log around this time first, best first", () => {
    const events = [
      ...daily("weight", WEEKDAYS, 7, 45),
      ...daily("nutrition", WEEKDAYS, 8, 20),
      ...daily("leetcode", [19, 20, 21], 8, 30),
      ...daily("runs", [19], 8, 50), // once: still counts, less
      ...daily("journal", WEEKDAYS, 22, 0), // evenings: not now
    ];
    expect(topChips(events, NOW, ALL)).toEqual(["weight", "nutrition", "leetcode"]);
  });

  it("time of day matters: the evening habit wins in the evening", () => {
    const events = [...daily("weight", WEEKDAYS, 7, 45), ...daily("journal", WEEKDAYS, 22, 0)];
    expect(topChips(events, at(22, 21, 50), ALL)[0]).toBe("journal");
    expect(topChips(events, NOW, ALL)).toEqual(["weight"]);
  });

  it("nothing outside ±90 minutes counts, and it fades toward the edge", () => {
    expect(scoreChips(daily("runs", WEEKDAYS, 9, 31), NOW).has("runs")).toBe(false);
    const edge = scoreChips(daily("runs", WEEKDAYS, 9, 29), NOW).get("runs")!;
    const near = scoreChips(daily("runs", WEEKDAYS, 8, 15), NOW).get("runs")!;
    expect(edge).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(10 * edge);
  });

  it("wraps around midnight", () => {
    const late = daily("personal", [19, 20, 21], 23, 50);
    expect(topChips(late, at(22, 0, 10), ALL)).toEqual(["personal"]);
  });

  it("weekends learn separately, with weekday habits counting a little", () => {
    const events = [
      ...daily("leetcode", WEEKDAYS, 8, 0),
      ...daily("runs", [10, 11, 17, 18], 8, 30), // weekend mornings
    ];
    const saturday = at(24, 8, 0);
    expect(topChips(events, saturday, ALL)).toEqual(["runs", "leetcode"]);
    expect(topChips(events, NOW, ALL)[0]).toBe("leetcode");
  });

  it("recent weeks outweigh older ones", () => {
    const events = [...daily("callbacks", [1, 2, 5, 6, 7], 8, 0), ...daily("applications", [19, 20, 21], 8, 0)];
    expect(topChips(events, NOW, ALL)).toEqual(["applications", "callbacks"]);
  });

  it("ignores anything older than eight weeks, and anything in the future", () => {
    const old = [save("runs", new Date(2026, 7, 20, 8)), save("runs", new Date(2026, 7, 21, 8))];
    expect(topChips([...old, save("talos", at(23, 8))], NOW, ALL)).toEqual([]);
  });

  it("a chip send counts double a plain save", () => {
    const s = scoreChips([save("weight", at(21, 8)), chip("nutrition", at(21, 8))], NOW);
    expect(s.get("nutrition")).toBeCloseTo(2 * s.get("weight")!);
  });

  it("a burst of saves to one tab is one use", () => {
    const lunch = [save("nutrition", at(21, 8, 0)), save("nutrition", at(21, 8, 5)), save("nutrition", at(21, 8, 12))];
    expect(scoreChips(lunch, NOW).get("nutrition")).toBeCloseTo(scoreChips([lunch[0]], NOW).get("nutrition")!);
    // ...but a chip send in the same burst still adds its own weight.
    expect(scoreChips([...lunch, chip("nutrition", at(21, 8, 0))], NOW).get("nutrition")).toBeCloseTo(
      3 * scoreChips([lunch[0]], NOW).get("nutrition")!,
    );
  });

  it("needs a little history before promoting anything", () => {
    expect(topChips([], NOW, ALL)).toEqual([]);
    // One save at the edge of the window, a month ago, on a weekend: too weak.
    expect(topChips([save("content", at(4, 6, 40))], NOW, ALL)).toEqual([]);
  });

  it("only picks from the chips shown (archived tabs are skipped), ties keep the usual order", () => {
    const events = [...daily("leetcode", WEEKDAYS, 8), ...daily("runs", WEEKDAYS, 8), ...daily("weight", WEEKDAYS, 8)];
    expect(topChips(events, NOW, ALL)).toEqual(["weight", "leetcode", "runs"]);
    expect(topChips(events, NOW, ALL.filter((t) => t !== "leetcode"))).toEqual(["weight", "runs"]);
  });
});

describe("orderChips", () => {
  it("top ones first in rank order, the rest in their usual order", () => {
    const { first, rest } = orderChips(CHAT_TABS, ["runs", "weight"]);
    expect(first.map((c) => c.key)).toEqual(["runs", "weight"]);
    expect(rest.map((c) => c.key)).toEqual(ALL.filter((k) => k !== "runs" && k !== "weight"));
  });

  it("no ranking leaves the usual order", () => {
    const { first, rest } = orderChips(CHAT_TABS, []);
    expect(first).toEqual([]);
    expect(rest.map((c) => c.key)).toEqual(ALL);
  });
});

describe("tabOfSave", () => {
  it("maps each table, and notes by kind", () => {
    expect(tabOfSave("weights", null)).toBe("weight");
    expect(tabOfSave("food_log", null)).toBe("nutrition");
    expect(tabOfSave("saved_meals", null)).toBe("nutrition");
    expect(tabOfSave("leetcode_log", null)).toBe("leetcode");
    expect(tabOfSave("runs", null)).toBe("runs");
    expect(tabOfSave("application_reminders", null)).toBe("applications");
    expect(tabOfSave("callbacks", null)).toBe("callbacks");
    expect(tabOfSave("notes", "journal")).toBe("journal");
    expect(tabOfSave("notes", "personal")).toBe("personal");
    expect(tabOfSave("notes", "talos")).toBe("talos");
    expect(tabOfSave("notes", "content")).toBe("content");
    expect(tabOfSave("notes", "weight")).toBe("weight");
  });

  it("saves that aren't a chat tab don't count", () => {
    for (const t of ["sets", "workouts", "exercises", "breaks", "reminders", "settings"]) expect(tabOfSave(t, null)).toBeNull();
  });
});
