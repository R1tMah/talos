// System Design Prep on Watch: the curriculum's shape, and where the plan stands on a
// given day. Pure; the curriculum is static data (sysdesign-curriculum.json, loaded
// lazily by the card), the start date is the source's config, and "done" is one row
// per session (see lib/watch/prepData.ts).

import { addDays } from "@/lib/date";

export interface QA {
  q: string;
  a: string;
}

export interface Mock {
  prompt: string;
  clock: { minutes: number; phase: string; what_to_do: string }[];
  numbers_to_hit: string[];
  must_say_terms: string[];
  pressure_questions: { q: string; strong_answer: string }[];
  common_traps: string[];
  senior_signals: string[];
  after_mock: string;
}

export interface Session {
  session: number;
  cycle: number;
  weekday: string;
  time_of_day: string;
  day_offset: number;
  title: string;
  kind: "learn" | "mock";
  minutes: number;
  goal: string;
  warmup_note: string;
  warmup: QA[];
  sections: { heading: string; body: string }[];
  key_terms: { term: string; definition: string }[];
  interviewer_follow_ups: { q: string; strong_answer: string }[];
  say_it_out_loud: string[];
  drill: QA[];
  mock: Mock | null;
}

export interface Curriculum {
  curriculum_id: string;
  title: string;
  suggested_start_date: string;
  schedule: { day_offsets_within_a_cycle: number[]; cycles: number; cycle_length_days: number; sessions_total: number };
  cycles: { cycle: number; theme: string; mock: string }[];
  rubric: string[];
  level_calibration: string;
  baseline_note: string;
  mock_prompt_template: string;
  final_review_prompt: string;
  sessions: Session[];
}

/** The Watch source's settings: day 1 (a Monday). Blank until picked. */
export interface PrepConfig {
  start: string;
}

// The curriculum's rhythm, for ordering Watch without loading the curriculum: 4 weekly
// cycles from a Monday start, sessions on days 0, 2, 4 and 6 of each (Mon, Wed, Fri
// lessons, Sunday mock). A test keeps these in step with the JSON.
export const SESSION_OFFSETS = [0, 2, 4, 6];
export const CYCLE_DAYS = 7;
export const CYCLES = 4;

/** True when `date` (a logical date) has a session, counting from the plan's start. */
export function isSessionDay(start: string, date: string): boolean {
  if (!start || date < start) return false;
  const i = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
  return i < CYCLES * CYCLE_DAYS && SESSION_OFFSETS.includes(i % CYCLE_DAYS);
}

/** "Mock: paste today's prompt" filled into the curriculum's interviewer template. */
export const mockPrompt = (c: Pick<Curriculum, "mock_prompt_template">, m: Pick<Mock, "prompt">) =>
  c.mock_prompt_template.replace("[PASTE PROMPT]", m.prompt);

export type Dated<T> = T & { date: string };

export interface PrepStatus<T> {
  /** Every session with its date. */
  all: Dated<T>[];
  /** Today's session, if today is a session day. */
  today: Dated<T> | null;
  /** Earlier sessions not marked done, oldest first: shown with a catch-up badge. */
  missed: Dated<T>[];
  /** The next session after today. */
  next: Dated<T> | null;
  done: number;
}

/** Where the plan stands on `today`. Null until a start date is set. */
export function prepStatus<T extends { session: number; day_offset: number }>(
  sessions: readonly T[], start: string, today: string, done: ReadonlySet<number>,
): PrepStatus<T> | null {
  if (!start) return null;
  const all = sessions.map((s) => ({ ...s, date: addDays(start, s.day_offset) }));
  return {
    all,
    today: all.find((s) => s.date === today) ?? null,
    missed: all.filter((s) => s.date < today && !done.has(s.session)),
    next: all.find((s) => s.date > today) ?? null,
    done: all.filter((s) => done.has(s.session)).length,
  };
}
