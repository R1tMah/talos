// Lifts from Liftoff: the CSV the owner exports from the Liftoff app and pastes into Chat,
// parsed and checked by code (never the model), and the numbers the Lifts tab shows.
//
//   parseLiftoff()  the pasted text -> sets, or the exact lines that don't parse
//   e1rm()          Epley: weight × (1 + reps / 30), from sets with weight > 0 and reps > 0
//   sessionsFor()   one point per session (date + workout) per exercise: its best e1RM
//   PPL, BIG_THREE  how exercises are grouped on the tab
//
// Pure: no React, no Supabase.

export const LIFTOFF_HEADER = ["Date", "Duration", "Workout Name", "Exercise Name", "Set Order", "Weight", "Reps", "Distance", "Seconds", "RPE", "Notes"] as const;

/** True when the message is a Liftoff export: its first non-empty line is the header. */
export function isLiftoffCsv(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const cells = splitCsv(first)[0] ?? [];
  return cells.length >= 7 && LIFTOFF_HEADER.slice(0, 7).every((h, i) => norm(cells[i]) === norm(h));
}

const norm = (s: string | undefined) => (s ?? "").trim().replace(/^﻿/, "").toLowerCase();

/**
 * RFC 4180-style CSV: commas and newlines inside "quoted" fields, "" for a quote. Returns
 * rows of cells, each with the 1-based line it started on.
 */
export function splitCsv(text: string): string[][] & { lines?: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      lines.push(rowLine);
      row = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
    lines.push(rowLine);
  }
  return Object.assign(rows, { lines });
}

export interface LiftSet {
  date: string; // YYYY-MM-DD, the session's day
  started: string; // the Date cell exactly as exported: with the time, it tells sessions apart
  duration: string | null; // as exported ("1h 5m", "45:12", …)
  workout: string;
  exercise: string;
  order: number;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  seconds: number | null;
  rpe: number | null;
  notes: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The day of a Date cell: "2026-11-03", "2026-11-03 18:22:10", "2026-11-03T18:22", "11/3/2026", "Nov 3, 2026 6:22 PM". */
export function dayOf(cell: string): string | null {
  const t = cell.trim();
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : null;
  };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ ,].*)?$/);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:[ ,].*)?$/);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

/** A number cell: empty is null; anything else must be a plain number (1,234.5 allowed). */
function num(cell: string | undefined): number | null | "bad" {
  const t = (cell ?? "").trim().replace(/,(?=\d{3}\b)/g, "");
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : "bad";
}

export interface ParseResult {
  sets: LiftSet[];
  /** "Line 14: Reps is "8x"": every row that didn't parse, exactly where. Nothing is saved while there are any. */
  errors: string[];
}

/** The whole paste, checked cell by cell. Blank lines are skipped; any bad row is reported. */
export function parseLiftoff(text: string): ParseResult {
  const rows = splitCsv(text);
  const lines = rows.lines ?? [];
  const errors: string[] = [];
  const sets: LiftSet[] = [];
  let headerAt = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => c.trim())) {
      headerAt = i;
      break;
    }
  }
  if (headerAt < 0 || !isLiftoffCsv(rows[headerAt].join(","))) return { sets, errors: ["The first line isn't the Liftoff header (Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,…)."] };

  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => c.trim())) continue;
    const at = `Line ${lines[i] ?? i + 1}`;
    if (r.length < 7 || r.length > LIFTOFF_HEADER.length) {
      errors.push(`${at}: has ${r.length} columns, expected ${LIFTOFF_HEADER.length}.`);
      continue;
    }
    const [dateCell, duration, workout, exercise, order, weight, reps, distance, seconds, rpe, notes] = r;
    const date = dayOf(dateCell ?? "");
    const fields = { order: num(order), weight: num(weight), reps: num(reps), distance: num(distance), seconds: num(seconds), rpe: num(rpe) };
    const bad = (Object.entries(fields) as [string, number | null | "bad"][]).filter(([, v]) => v === "bad").map(([k]) => k);
    // Workout Name is often empty in Liftoff exports; the workout gets a name from its exercises below.
    if (!date) errors.push(`${at}: Date "${dateCell}" isn't a date.`);
    else if (!exercise?.trim()) errors.push(`${at}: Exercise Name is empty.`);
    else if (bad.length) errors.push(`${at}: ${bad.map((b) => ({ order: "Set Order", weight: "Weight", reps: "Reps", distance: "Distance", seconds: "Seconds", rpe: "RPE" })[b]).join(", ")} isn't a number.`);
    else if ((fields.weight as number | null) != null && (fields.weight as number) < 0) errors.push(`${at}: Weight is negative.`);
    else if ((fields.reps as number | null) != null && (!Number.isInteger(fields.reps) || (fields.reps as number) < 0)) errors.push(`${at}: Reps isn't a whole number.`);
    else {
      sets.push({
        date,
        started: (dateCell ?? "").trim(),
        duration: duration?.trim() || null,
        workout: (workout ?? "").trim(),
        exercise: exercise.trim(),
        order: fields.order == null ? 0 : Math.round(fields.order as number),
        weight: fields.weight as number | null,
        reps: fields.reps as number | null,
        distance: fields.distance as number | null,
        seconds: fields.seconds as number | null,
        rpe: fields.rpe as number | null,
        notes: notes?.trim() || null,
      });
    }
  }
  if (!errors.length && !sets.length) errors.push("There are no sets under the header.");
  return { sets: errors.length ? sets : named(dedupe(sets)), errors };
}

/**
 * A workout is identified by the export's Date cell: Liftoff writes the start time to the
 * second, so it's unique per workout (and stays the same when the workout is exported again).
 */
export const sessionKey = (s: Pick<LiftSet, "started">) => s.started;

/** The same set listed twice in one paste (Liftoff repeats whole workouts sometimes): kept once, the later copy. */
function dedupe(sets: LiftSet[]): LiftSet[] {
  const byKey = new Map<string, LiftSet>();
  for (const s of sets) byKey.set(`${s.started}\u0000${s.exercise.toLowerCase()}\u0000${s.order}`, s);
  return [...byKey.values()];
}

/** A workout without a Workout Name is named for the split most of its exercises are in ("Push"), else "Workout". */
function named(sets: LiftSet[]): LiftSet[] {
  const names = new Map<string, string>();
  for (const [started, list] of groupBy(sets, (s) => s.started)) {
    const given = list.find((s) => s.workout)?.workout;
    if (given) {
      names.set(started, given);
      continue;
    }
    const counts = new Map<string, number>();
    for (const ex of new Set(list.map((s) => s.exercise.toLowerCase()))) {
      const sp = splitOf(ex);
      if (sp) counts.set(sp, (counts.get(sp) ?? 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    names.set(started, top ? top[0] : "Workout");
  }
  return sets.map((s) => ({ ...s, workout: names.get(s.started)! }));
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return out;
}

/** "01 hours 19 minutes 36 seconds" -> "1h 19m"; "00 hours 42 minutes 27 seconds" -> "42m". Anything else as exported. */
export function shortDuration(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^\s*(\d+)\s*hours?\s+(\d+)\s*minutes?(?:\s+(\d+)\s*seconds?)?\s*$/i);
  if (!m) return d;
  const h = Number(m[1]), min = Number(m[2]);
  return h ? `${h}h ${min}m` : `${min}m`;
}

/** What an import will do, in one line: "26 workouts, 412 sets, Aug 25 to Nov 6. Replaces 3 already imported." */
export function importSummary(sets: LiftSet[], replaced: number, fmtDay: (d: string) => string): { workouts: number; dates: string; text: string; unsorted: string[] } {
  const workouts = new Set(sets.map(sessionKey)).size;
  const days = [...new Set(sets.map((s) => s.date))].sort();
  const dates = days.length === 1 ? fmtDay(days[0]) : `${fmtDay(days[0])} to ${fmtDay(days.at(-1)!)}`;
  const unsorted = [...new Set(sets.filter((s) => !splitOf(s.exercise)).map((s) => s.exercise))];
  const text =
    `${workouts} ${workouts === 1 ? "workout" : "workouts"}, ${sets.length} sets, ${dates}` +
    (replaced ? `. Replaces ${replaced} already imported (same start time).` : ".") +
    (unsorted.length ? ` Not in Push/Pull/Legs, shown under Other: ${unsorted.join(", ")}.` : "");
  return { workouts, dates, text, unsorted };
}

// ---- 1RM --------------------------------------------------------------------------------------

/** Epley estimated one-rep max, or null for a set without weight and reps. */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null || weight <= 0 || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export interface SessionPoint {
  date: string;
  workout: string;
  e1rm: number;
  best: string; // the set it came from: "135 × 8"
  exercise: string; // which exercise (matters for a group like Hammer Curls)
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * One point per session for these exercise names: the session's best e1RM among them.
 * Sessions without a weighted set are left out. Oldest first.
 */
export function sessionsFor(sets: LiftSet[], names: readonly string[]): SessionPoint[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const best = new Map<string, SessionPoint>();
  for (const s of sets) {
    if (!want.has(s.exercise.toLowerCase())) continue;
    const v = e1rm(s.weight, s.reps);
    if (v == null) continue;
    const k = sessionKey(s);
    const cur = best.get(k);
    if (!cur || v > cur.e1rm) best.set(k, { date: s.date, workout: s.workout, e1rm: v, best: `${fmt(s.weight!)} × ${s.reps}`, exercise: s.exercise });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * For bodyweight work (no weight, so no 1RM): one point per session, the most reps in a set.
 * `e1rm` holds the reps here. Oldest first.
 */
export function repsFor(sets: LiftSet[], names: readonly string[]): SessionPoint[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const best = new Map<string, SessionPoint>();
  for (const s of sets) {
    if (!want.has(s.exercise.toLowerCase()) || !s.reps) continue;
    const k = sessionKey(s);
    const cur = best.get(k);
    if (!cur || s.reps > cur.e1rm) best.set(k, { date: s.date, workout: s.workout, e1rm: s.reps, best: setText(s), exercise: s.exercise });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Push / Pull / Legs ----------------------------------------------------------------------------

/** The owner's split. Core work is under Legs to keep it three days. Matched by name, ignoring case. */
export const PPL = {
  Push: [
    "Cable Fly", "Incline Bench Press", "Dumbbell Shoulder Press", "Dumbbell Lateral Raise", "Tricep Pushdown",
    "Incline Dumbbell Bench Press", "Machine Chest Fly", "Machine Tricep Extension",
  ],
  Pull: [
    "Lat Pulldown", "Chest Supported Dumbbell Row", "Seated Hammer Curl", "Cable Reverse Fly", "Incline Dumbbell Curl",
    "Machine Reverse Fly", "Seated Cable Row", "Iso-Lateral Row", "One Arm Machine Reverse Fly", "Hammer Curl", "Cross Body Hammer Curl",
  ],
  Legs: [
    "Lying Leg Curl", "Leg Extension", "Horizontal Leg Press", "Hack Squat", "Dumbbell Calf Raise", "Machine Calf Press",
    "Reverse Nordic Curl", "Seated Calf Raise", "Cable Crunch", "Captain's Chair Leg Raise", "Machine Seated Crunch",
  ],
} as const;
export type Split = keyof typeof PPL;
export const SPLITS = Object.keys(PPL) as Split[];

/** Push, Pull, Legs, or null for an exercise that isn't in the split (shown under "Other"). */
export function splitOf(exercise: string): Split | null {
  const e = exercise.trim().toLowerCase();
  return SPLITS.find((s) => PPL[s].some((n) => n.toLowerCase() === e)) ?? null;
}

/** The three lifts at the top of the tab. Hammer Curls is three exercises counted as one. */
export const BIG_THREE = [
  { key: "incline", title: "Incline DB Bench", names: ["Incline Dumbbell Bench Press"] },
  { key: "hack", title: "Hack Squat", names: ["Hack Squat"] },
  { key: "hammer", title: "Hammer Curls", names: ["Seated Hammer Curl", "Cross Body Hammer Curl", "Hammer Curl"] },
] as const;

/** Every exercise name in the sets, each once, with the exercise's own spelling from its latest set. */
export function exerciseNames(sets: LiftSet[]): string[] {
  const byKey = new Map<string, string>();
  for (const s of sets) byKey.set(s.exercise.toLowerCase(), s.exercise);
  return [...byKey.values()];
}

// ---- History ----------------------------------------------------------------------------------------

export interface Session {
  key: string;
  date: string;
  workout: string;
  duration: string | null;
  exercises: { name: string; sets: LiftSet[] }[];
}

/** Sets grouped into sessions (newest first), exercises in the order they were done, sets by Set Order. */
export function sessions(sets: LiftSet[]): Session[] {
  const out = new Map<string, Session>();
  for (const s of sets) {
    const k = sessionKey(s);
    let sess = out.get(k);
    if (!sess) out.set(k, (sess = { key: k, date: s.date, workout: s.workout, duration: s.duration, exercises: [] }));
    let ex = sess.exercises.find((e) => e.name.toLowerCase() === s.exercise.toLowerCase());
    if (!ex) sess.exercises.push((ex = { name: s.exercise, sets: [] }));
    ex.sets.push(s);
  }
  for (const sess of out.values()) for (const ex of sess.exercises) ex.sets.sort((a, b) => a.order - b.order);
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

/** "135 × 8", "BW × 12", "45 s", "0.5 mi": a set in the owner's own numbers. */
export function setText(s: Pick<LiftSet, "weight" | "reps" | "distance" | "seconds">): string {
  if (s.reps != null && s.reps > 0) return `${s.weight ? fmt(s.weight) : "BW"} × ${s.reps}`;
  if (s.seconds) return `${fmt(s.seconds)} s`;
  if (s.distance) return `${fmt(s.distance)} dist`;
  return s.weight ? fmt(s.weight) : "–";
}
