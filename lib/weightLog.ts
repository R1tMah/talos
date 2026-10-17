// The weight history as the owner keeps it in their notes: numbered week blocks,
// oldest first, each week's weigh-ins followed by its average, with phases, trips and
// dated notes where they happened. Pure: built from rows already loaded.

import { addDays, logicalToday, weekStart } from "./date";
import type { Break, WeightEntry } from "./types";

export interface PhaseText {
  id: string;
  start: string;
  calories: number | null;
  description: string | null; // the owner's own words
}

export interface WeightNote {
  id: string;
  date: string;
  body: string; // verbatim
}

export interface WeekAverage {
  week: string; // Monday
  avg: number;
  days: number;
}

/** Inside a week, in date order: a weigh-in, a trip that started that week, or a note. */
export type WeekLine =
  | { kind: "day"; date: string; entry: WeightEntry }
  | { kind: "break"; date: string; brk: Break }
  | { kind: "note"; date: string; note: WeightNote };

export type LogItem =
  | { kind: "phase"; id: string; phase: PhaseText }
  | { kind: "week"; id: string; number: number; start: string; end: string; avg: number; days: number; partial: boolean; lines: WeekLine[] }
  /** A trip or note dated in a week with no weigh-ins sits between the weeks around it. */
  | { kind: "between"; id: string; line: Exclude<WeekLine, { kind: "day" }> };

/**
 * Weeks run Monday to Sunday and are numbered by logged weeks, like the owner's notes:
 * a week with no weigh-ins is skipped, so the week after a gap keeps counting from the
 * last logged one. Only the current week is marked partial.
 */
export function buildWeightLog(input: {
  entries: WeightEntry[];
  weeks: WeekAverage[];
  phases: PhaseText[];
  breaks: Break[];
  notes: WeightNote[];
  today?: string;
}): LogItem[] {
  const today = input.today ?? logicalToday();
  const thisWeek = weekStart(today);
  const weeks = [...input.weeks].sort((a, b) => a.week.localeCompare(b.week));
  const logged = new Set(weeks.map((w) => w.week));

  // Every dated line, sorted by date. On the same date: weigh-in, then trip, then note.
  const order = { day: 0, break: 1, note: 2 } as const;
  const lines: WeekLine[] = [
    ...input.entries.map((entry) => ({ kind: "day" as const, date: entry.date, entry })),
    ...input.breaks.map((brk) => ({ kind: "break" as const, date: brk.start, brk })),
    ...input.notes.map((note) => ({ kind: "note" as const, date: note.date, note })),
  ].sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);

  const linesIn = (week: string) => lines.filter((l) => weekStart(l.date) === week);
  const phaseFor = (week: string) => input.phases.filter((p) => weekStart(p.start) === week);

  const items: LogItem[] = [];
  const placedPhases = new Set<string>();
  const pushPhases = (week: string) => {
    for (const p of phaseFor(week)) {
      if (placedPhases.has(p.id)) continue;
      placedPhases.add(p.id);
      items.push({ kind: "phase", id: `phase-${p.id}`, phase: p });
    }
  };

  // Walk week by week from the first week with anything in it to the last.
  const allWeeks = [...new Set([...weeks.map((w) => w.week), ...lines.map((l) => weekStart(l.date)), ...input.phases.map((p) => weekStart(p.start))])].sort();
  let number = 0;
  for (const week of allWeeks) {
    pushPhases(week);
    const inWeek = linesIn(week);
    if (logged.has(week)) {
      const avg = weeks.find((w) => w.week === week)!;
      number += 1;
      items.push({
        kind: "week", id: `week-${week}`, number, start: week, end: addDays(week, 6),
        avg: avg.avg, days: avg.days, partial: week === thisWeek, lines: inWeek,
      });
    } else {
      for (const l of inWeek) if (l.kind !== "day") items.push({ kind: "between", id: `${l.kind}-${l.kind === "break" ? l.brk.id : l.note.id}`, line: l });
    }
  }
  return items;
}

// ---- Export ----------------------------------------------------------------------------

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const span = (b: Break) => (b.end == null ? `from ${md(b.start)}` : b.end === b.start ? md(b.start) : `${md(b.start)}–${md(b.end)}`);

function lineText(l: WeekLine) {
  if (l.kind === "day") return `${md(l.date)}: ${l.entry.lb.toFixed(1)}${l.entry.note ? ` (${l.entry.note})` : ""}`;
  if (l.kind === "break") return `[${l.brk.label}] (${span(l.brk)})`;
  return l.note.body;
}

/**
 * The log as plain text in the owner's own format: "3/23: 195.1" lines, "Week 1 average:
 * 196.2", phase descriptions and notes in their words, trips in [brackets]. Oldest first.
 */
export function weightLogText(items: LogItem[]): string {
  const blocks: string[] = [];
  for (const item of items) {
    if (item.kind === "phase") {
      const p = item.phase;
      blocks.push(p.description ?? `${p.calories ? `${p.calories} cal ` : ""}from ${md(p.start)}`);
    } else if (item.kind === "between") {
      blocks.push(lineText(item.line));
    } else {
      blocks.push(
        [
          `Week ${item.number} (${md(item.start)}–${md(item.end)})`,
          ...item.lines.map(lineText),
          `Week ${item.number} average: ${item.avg.toFixed(1)} (${item.days} of 7 days${item.partial ? ", partial" : ""})`,
        ].join("\n"),
      );
    }
  }
  return blocks.join("\n\n") + "\n";
}

/** Spreadsheet rows, oldest first: one per weigh-in with its week, plus trips and notes. */
export function weightLogRows(items: LogItem[]) {
  const rows: Record<string, string>[] = [];
  const add = (week: string, avg: string, l: WeekLine) =>
    rows.push({
      week, date: l.date,
      lb: l.kind === "day" ? l.entry.lb.toFixed(1) : "",
      week_avg: avg,
      note: l.kind === "day" ? (l.entry.note ?? "") : l.kind === "note" ? l.note.body : "",
      break: l.kind === "break" ? `${l.brk.label} (${span(l.brk)})` : "",
    });
  for (const item of items) {
    if (item.kind === "week") for (const l of item.lines) add(String(item.number), item.avg.toFixed(1), l);
    else if (item.kind === "between") add("", "", item.line);
  }
  return rows;
}
