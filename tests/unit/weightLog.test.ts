// The Weight tab's log view: numbered week blocks, oldest first.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { weekStart } from "@/lib/date";
import type { WeightEntry } from "@/lib/types";
import { buildWeightLog, type LogItem, type WeekAverage } from "@/lib/weightLog";

const entry = (date: string, lb: number, note?: string): WeightEntry => ({ id: `w-${date}`, date, time: "08:00", lb, note });

/** Weekly averages the way the weekly_weights view computes them. */
function averages(entries: WeightEntry[]): WeekAverage[] {
  const by = new Map<string, number[]>();
  for (const e of entries) by.set(weekStart(e.date), [...(by.get(weekStart(e.date)) ?? []), e.lb]);
  return [...by].map(([week, xs]) => ({ week, avg: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10, days: xs.length }));
}

const weeksOf = (items: LogItem[]) => items.filter((i): i is Extract<LogItem, { kind: "week" }> => i.kind === "week");

describe("Weight log", () => {
  const entries = [
    entry("2026-07-13", 172.8), entry("2026-07-15", 173.4), entry("2026-07-19", 176.4),
    entry("2026-08-10", 172.4), entry("2026-08-16", 172.5),
    entry("2026-08-25", 175.0), entry("2026-08-30", 172.8),
    entry("2026-10-13", 168.9),
  ];
  const items = buildWeightLog({
    entries,
    weeks: averages(entries),
    phases: [{ id: "p3", start: "2026-08-25", calories: 2250, description: "Now starting 8/25 I’ve been eating about 2250" }],
    breaks: [
      { id: "ny", start: "2026-07-16", end: "2026-07-18", label: "NY Trip where we ate like a fatass" },
      { id: "home", start: "2026-08-17", end: "2026-08-24", label: "10 day fatass run" },
    ],
    notes: [{ id: "n1", date: "2026-08-30", body: "weight as plateaued" }],
    today: "2026-10-14",
  });

  it("lists weeks oldest first, numbered by logged weeks only", () => {
    expect(weeksOf(items).map((w) => [w.number, w.start])).toEqual([
      [1, "2026-07-13"], [2, "2026-08-10"], [3, "2026-08-24"], [4, "2026-10-12"],
    ]);
  });

  it("a trip inside a logged week sits between its days, in date order", () => {
    const week = weeksOf(items)[0];
    expect(week.lines.map((l) => (l.kind === "day" ? l.date : `${l.kind}:${l.date}`))).toEqual([
      "2026-07-13", "2026-07-15", "break:2026-07-16", "2026-07-19",
    ]);
  });

  it("a trip starting in a week with no weigh-ins sits between the weeks around it", () => {
    const i = items.findIndex((x) => x.kind === "between");
    expect(items[i]).toMatchObject({ kind: "between", line: { kind: "break", brk: { id: "home" } } });
    expect(items[i - 1]).toMatchObject({ kind: "week", start: "2026-08-10" });
  });

  it("a phase appears just before the week it starts in", () => {
    const i = items.findIndex((x) => x.kind === "phase");
    expect(items[i + 1]).toMatchObject({ kind: "week", start: "2026-08-24" });
  });

  it("a dated note sits in its week after that day's weigh-in", () => {
    const week = weeksOf(items)[2];
    expect(week.lines.map((l) => l.kind)).toEqual(["day", "day", "note"]);
  });

  it("only the current week is partial, and the averages come from the weekly rows", () => {
    expect(weeksOf(items).map((w) => w.partial)).toEqual([false, false, false, true]);
    expect(weeksOf(items)[0]).toMatchObject({ avg: 174.2, days: 3 });
  });
});

// The owner's own numbering from the weight note: Week 22 is the week of 8/24 because
// the empty week of 8/17 is skipped.
const NOTE = new URL("../../data/weights.txt", import.meta.url).pathname;
describe.skipIf(!existsSync(NOTE))("Weight log numbering against the owner's note", () => {
  it("numbers weeks the same way the note does (Week 22 = week of 8/24, Week 27 = week of 9/28)", () => {
    const entries = [...readFileSync(NOTE, "utf8").matchAll(/^(\d{1,2})[/:](\d{1,2})[:;]?\s*(\d{2,3}\.\d)$/gm)].map((m) =>
      entry(`2026-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, Number(m[3])),
    );
    const weeks = weeksOf(buildWeightLog({ entries, weeks: averages(entries), phases: [], breaks: [], notes: [], today: "2026-10-14" }));
    const numberOf = (start: string) => weeks.find((w) => w.start === start)?.number;
    expect(numberOf("2026-03-23")).toBe(1);
    expect(numberOf("2026-08-24")).toBe(22);
    expect(numberOf("2026-09-28")).toBe(27);
  });
});

describe("Weight log export", () => {
  it("writes the owner's format: M/D lines, week averages, trips in brackets, oldest first", async () => {
    const { weightLogText } = await import("@/lib/weightLog");
    const entries = [entry("2026-07-13", 172.8), entry("2026-07-15", 173.4), entry("2026-07-19", 176.4), entry("2026-07-20", 175.2)];
    const text = weightLogText(
      buildWeightLog({
        entries,
        weeks: averages(entries),
        phases: [{ id: "p", start: "2026-07-13", calories: 2100, description: "From 5/26-8/14 I was eating 2100 calories" }],
        breaks: [{ id: "ny", start: "2026-07-16", end: "2026-07-18", label: "NY Trip where we ate like a fatass" }],
        notes: [{ id: "n", date: "2026-07-20", body: "All weight loss was fat I got stronger since I was 198" }],
        today: "2026-10-14",
      }),
    );
    expect(text).toBe(
      [
        "From 5/26-8/14 I was eating 2100 calories",
        "",
        "Week 1 (7/13–7/19)",
        "7/13: 172.8",
        "7/15: 173.4",
        "[NY Trip where we ate like a fatass] (7/16–7/18)",
        "7/19: 176.4",
        "Week 1 average: 174.2 (3 of 7 days)",
        "",
        "Week 2 (7/20–7/26)",
        "7/20: 175.2",
        "All weight loss was fat I got stronger since I was 198",
        "Week 2 average: 175.2 (1 of 7 days)",
        "",
      ].join("\n"),
    );
  });
});
