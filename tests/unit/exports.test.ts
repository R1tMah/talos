// Every tab export: the rows each one builds, and the markdown and CSV made from them.
// Screen exports (Weight, Applications, Runs) are built from rows already loaded;
// live exports (Nutrition, LeetCode, Callbacks, the notepads) query Supabase.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEntry } from "@/lib/applicationsData";
import { toHM } from "@/lib/date";
import { toCsv, toMarkdown, type TabExport } from "@/lib/exportTab";
import type { Run } from "@/lib/runsData";
import { applicationsExport, runsExport, weightExport } from "@/lib/screenExports";
import { buildWeightLog, weightLogText } from "@/lib/weightLog";

// ---- A Supabase stand-in that records each query and answers with canned rows ----

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fail: false,
  calls: [] as { table: string; steps: [string, ...unknown[]][] }[],
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from(table: string) {
      const call = { table, steps: [] as [string, ...unknown[]][] };
      db.calls.push(call);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order"]) b[m] = (...args: unknown[]) => (call.steps.push([m, ...args]), b);
      b.then = (ok: (v: unknown) => void) => {
        let rows = db.tables[table] ?? [];
        for (const [m, c, v] of call.steps) {
          if (m === "eq") rows = rows.filter((r) => r[c as string] === v);
          if (m === "is" && v === null) rows = rows.filter((r) => r[c as string] == null);
        }
        ok(db.fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
      };
      return b;
    },
  }),
}));

const { loadExport } = await import("@/lib/exportLive");

/** Reads CSV back into cells (quotes, doubled quotes, commas and newlines in cells). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") rows.at(-1)!.push(cell), (cell = "");
    else if (ch === "\n") rows.at(-1)!.push(cell), (cell = ""), rows.push([]);
    else cell += ch;
  }
  rows.at(-1)!.push(cell);
  return rows;
}

/** The CSV reads back as exactly the header and every row's values, in column order. */
function expectCsvRoundTrip(t: TabExport) {
  expect(parseCsv(toCsv(t))).toEqual([t.columns.map((c) => c.label), ...t.rows.map((r) => t.columns.map((c) => r[c.key]))]);
}

/** Every row has a string for every column (no undefined cells in either format). */
function expectComplete(t: TabExport) {
  for (const r of t.rows) for (const c of t.columns) expect(typeof r[c.key], `${t.title}.${c.key}`).toBe("string");
  expect(toMarkdown(t)).not.toContain("undefined");
  expect(toCsv(t)).not.toContain("undefined");
}

const tricky = 'Said "hi", then | left\nsecond line';

// ---- Shared formatting ----------------------------------------------------------

describe("markdown and CSV", () => {
  const table: TabExport = {
    title: "T",
    columns: [{ key: "a", label: "A" }, { key: "b", label: "B, with comma" }],
    rows: [{ a: "1", b: tricky }, { a: "", b: "plain" }],
  };

  it("table markdown escapes pipes and flattens newlines", () => {
    expect(toMarkdown(table)).toBe(
      ["# T, 2 entries", "", "| A | B, with comma |", "|---|---|", '| 1 | Said "hi", then \\| left second line |', "|  | plain |"].join("\n"),
    );
  });

  it("CSV quotes cells with commas, quotes or newlines and reads back exactly", () => {
    expect(toCsv(table).split("\n")[0]).toBe('A,"B, with comma"');
    expectCsvRoundTrip(table);
  });

  it("an empty export is just the heading, and a header-only CSV", () => {
    const empty = { ...table, rows: [] };
    expect(toMarkdown(empty)).toBe("# T, 0 entries");
    expect(toCsv(empty)).toBe('A,"B, with comma"');
  });

  it("body markdown puts short fields in the heading and the text underneath", () => {
    const t: TabExport = {
      title: "J",
      columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "minutes", label: "Minutes" }, { key: "text", label: "Text" }],
      rows: [{ date: "2026-10-23", time: "09:15", minutes: "20", text: "line one\nline two" }, { date: "2026-10-22", time: "", minutes: "", text: "" }],
      body: "text",
    };
    expect(toMarkdown(t)).toBe("# J, 2 entries\n\n### Oct 23 · 20 min\nline one\nline two\n\n### Oct 22");
  });
});

// ---- Screen exports ---------------------------------------------------------------

describe("Applications export", () => {
  const apps: AppEntry[] = [
    { id: "a1", date: "2026-10-20", time: "10:00", company: "Acme, Inc.", position: tricky, status: "Applied", resume: "SWE v3" },
    { id: "a2", date: "2026-10-18", time: "09:00", company: "Beta", position: "Intern", status: "Rejected", resume: null },
  ];
  const t = applicationsExport(apps);

  it("has one row per application, in the screen's order", () => {
    expect(t.rows).toEqual([
      { date: "2026-10-20", company: "Acme, Inc.", position: tricky, status: "Applied", resume: "SWE v3" },
      { date: "2026-10-18", company: "Beta", position: "Intern", status: "Rejected", resume: "" },
    ]);
    expect(toMarkdown(t).split("\n")[0]).toBe("# Applications, 2 entries");
  });

  it("is complete and round-trips through CSV", () => {
    expectComplete(t);
    expectCsvRoundTrip(t);
  });
});

describe("Runs export", () => {
  const runs: Run[] = [
    { id: "r1", date: "2026-10-21", time: "07:00", miles: 3.1, seconds: 1650, calories: 340, note: tricky },
    { id: "r2", date: "2026-10-19", time: "07:00", miles: 10, seconds: 5025, calories: null, note: null },
  ] as Run[];
  const t = runsExport(runs);

  it("formats miles, time, pace and calories", () => {
    expect(t.rows).toEqual([
      { date: "2026-10-21", miles: "3.1", time: "27:30", pace: "8:52", cal: "340", note: tricky },
      { date: "2026-10-19", miles: "10", time: "1:23:45", pace: "8:23", cal: "", note: "" },
    ]);
  });

  it("is complete and round-trips through CSV", () => {
    expectComplete(t);
    expectCsvRoundTrip(t);
  });
});

describe("Weight export", () => {
  const entry = (date: string, lb: number, note?: string) => ({ id: `w-${date}`, date, time: "08:00", lb, note });
  const log = buildWeightLog({
    entries: [entry("2026-10-05", 172.4), entry("2026-10-07", 171.8, "after travel"), entry("2026-10-13", 170.9)],
    weeks: [{ week: "2026-10-05", avg: 172.1, days: 2 }, { week: "2026-10-12", avg: 170.9, days: 1 }],
    phases: [{ id: "p1", start: "2026-10-05", calories: 2250, description: "Cutting at 2250" }],
    breaks: [{ id: "b1", start: "2026-10-08", end: "2026-10-10", label: "Trip" }] as never,
    notes: [{ id: "n1", date: "2026-10-14", body: "Felt good" }],
    today: "2026-10-14",
  });
  const t = weightExport(log);

  it("CSV rows are oldest first, with week numbers and averages", () => {
    expect(t.rows).toEqual([
      { week: "1", date: "2026-10-05", lb: "172.4", week_avg: "172.1", note: "", break: "" },
      { week: "1", date: "2026-10-07", lb: "171.8", week_avg: "172.1", note: "after travel", break: "" },
      { week: "1", date: "2026-10-08", lb: "", week_avg: "172.1", note: "", break: "Trip (10/8–10/10)" },
      { week: "2", date: "2026-10-13", lb: "170.9", week_avg: "170.9", note: "", break: "" },
      { week: "2", date: "2026-10-14", lb: "", week_avg: "170.9", note: "Felt good", break: "" },
    ]);
    expectComplete(t);
    expectCsvRoundTrip(t);
  });

  it("Copy text is the week-by-week log, oldest first", () => {
    expect(weightLogText(log)).toBe(
      [
        "Cutting at 2250",
        "",
        "Week 1 (10/5–10/11)\n10/5: 172.4\n10/7: 171.8 (after travel)\n[Trip] (10/8–10/10)\nWeek 1 average: 172.1 (2 of 7 days)",
        "",
        "Week 2 (10/12–10/18)\n10/13: 170.9\nFelt good\nWeek 2 average: 170.9 (1 of 7 days, partial)",
        "",
      ].join("\n"),
    );
  });
});

// ---- Live exports -----------------------------------------------------------------

const at = "2026-10-23T13:05:00.000Z";
const hm = toHM(new Date(at));

describe("live exports", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.fail = false;
    db.tables = {
      food_log: [
        { logical_date: "2026-10-23", created_at: at, description: tricky, calories: 520, protein_g: 42, amount: 1.5, unit: "cup", source: "library", deleted_at: null },
        { logical_date: "2026-10-22", created_at: at, description: "Apple", calories: 95, protein_g: null, amount: null, unit: null, source: "estimate", deleted_at: null },
        { logical_date: "2026-10-21", created_at: at, description: "Deleted", calories: 1, protein_g: 1, amount: null, unit: null, source: "x", deleted_at: at },
      ],
      leetcode_log: [
        { logical_date: "2026-10-23", created_at: at, title: "Two Sum", difficulty: "Easy", result: "solved", minutes: 20, topic: "Arrays", hints: 0, redo: true, inferred: false, notes: "hash map\nO(n)", deleted_at: null },
        { logical_date: "2026-10-22", created_at: at, title: "LRU Cache", difficulty: null, result: null, minutes: null, topic: null, hints: null, redo: false, inferred: true, notes: null, deleted_at: null },
        { logical_date: "2026-10-20", created_at: at, title: "Gone", redo: false, inferred: false, deleted_at: at },
      ],
      callbacks: [
        { logical_date: "2026-10-20", created_at: at, company: "Acme", kind: "Phone screen", outcome: "Passed", score: 8, debrief: tricky, deleted_at: null },
        { logical_date: null, created_at: at, company: "Beta", kind: "Onsite", outcome: null, score: null, debrief: null, deleted_at: null },
      ],
      notes: (["content", "journal", "personal", "talos"] as const).flatMap((kind) => [
        { kind, logical_date: "2026-10-23", created_at: at, body: `${kind} entry\nmore`, deleted_at: null },
        { kind, logical_date: "2026-10-22", created_at: at, body: `${kind} deleted`, deleted_at: at },
      ]),
    };
  });

  /** The query skipped deleted rows and asked for newest first. */
  const expectNewestLive = (table: string, dateCol = "logical_date") => {
    const steps = db.calls.find((c) => c.table === table)!.steps;
    expect(steps).toContainEqual(["is", "deleted_at", null]);
    expect(steps.find((s) => s[0] === "order")).toMatchObject(["order", dateCol, { ascending: false }]);
  };

  it("Nutrition: every food entry with time, kcal, protein and portions", async () => {
    const t = await loadExport("nutrition");
    expectNewestLive("food_log");
    expect(t.rows).toEqual([
      { date: "2026-10-23", time: hm, name: tricky, cal: "520", p: "42", portions: "1.5 cup", source: "library" },
      { date: "2026-10-22", time: hm, name: "Apple", cal: "95", p: "", portions: "", source: "estimate" },
    ]);
    expectComplete(t);
    expectCsvRoundTrip(t);
  });

  it("LeetCode: problems with flags, notes underneath in markdown", async () => {
    const t = await loadExport("leetcode");
    expectNewestLive("leetcode_log");
    expect(t.rows).toEqual([
      { date: "2026-10-23", time: hm, problem: "Two Sum", difficulty: "Easy", result: "solved", minutes: "20", topic: "Arrays", hints: "0", redo: "yes", inferred: "", notes: "hash map\nO(n)" },
      { date: "2026-10-22", time: hm, problem: "LRU Cache", difficulty: "", result: "", minutes: "", topic: "", hints: "", redo: "", inferred: "yes", notes: "" },
    ]);
    expect(toMarkdown(t)).toBe(
      "# LeetCode, 2 entries\n\n### Oct 23 · Two Sum · Easy · solved · 20 min · Arrays · 0 · in redo queue\nhash map\nO(n)\n\n### Oct 22 · LRU Cache",
    );
    expectComplete(t);
    expectCsvRoundTrip(t);
  });

  it("Callbacks: including one with no date yet", async () => {
    const t = await loadExport("callbacks");
    expectNewestLive("callbacks");
    expect(t.rows).toEqual([
      { date: "2026-10-20", company: "Acme", kind: "Phone screen", outcome: "Passed", score: "8", debrief: tricky },
      { date: "", company: "Beta", kind: "Onsite", outcome: "", score: "", debrief: "" },
    ]);
    expectComplete(t);
    expectCsvRoundTrip(t);
  });

  it.each([
    ["content", "Content"],
    ["journal", "Work Journal"],
    ["personal", "Personal Journal"],
    ["talos", "Talos Improvements"],
  ] as const)("%s notepad: only its own kind, deleted left out", async (kind, title) => {
    const t = await loadExport(kind);
    expectNewestLive("notes");
    expect(db.calls[0].steps).toContainEqual(["eq", "kind", kind]);
    expect(t.title).toBe(title);
    expect(t.rows).toEqual([{ date: "2026-10-23", time: hm, text: `${kind} entry\nmore` }]);
    expect(toMarkdown(t)).toBe(`# ${title}, 1 entries\n\n### Oct 23\n${kind} entry\nmore`);
    expectComplete(t);
    expectCsvRoundTrip(t);
  });

  it.each(["nutrition", "leetcode", "callbacks", "content", "journal", "personal", "talos"] as const)(
    "%s: a failed query throws (the sheet shows Failed)",
    async (tab) => {
      db.fail = true;
      await expect(loadExport(tab)).rejects.toThrow("export query failed");
    },
  );
});
