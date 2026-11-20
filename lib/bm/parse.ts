// Behavioral mocks v2: everything read from text the owner types or pastes, by fixed rules.
// No model is used and nothing is guessed: what can't be read is left for the owner to fill.

import { AREA_ORDER, isArea, MAX_QUESTIONS, TARGET_MAX, TARGET_MIN, type BmArea } from "./areas";

// ---- The question list (prompt 1's reply) ---------------------------------------------------------

/** One question read from the pasted list. `problems` lists what the owner must fix before saving. */
export interface ParsedQuestion {
  area: BmArea | null;
  targetSeconds: number | null;
  question: string;
  rubric: string; // the bullet lines, verbatim, one per line ("- item")
  block: string; // the block's own text, as pasted
  problems: string[];
}

export interface ParsedList {
  rows: ParsedQuestion[];
  warnings: string[];
}

/** Markdown decoration Claude sometimes adds around a line (bold, headings, quotes). */
const undecorate = (line: string) => line.replace(/^[\s>#*_]+/, "").replace(/[\s*_]+$/, "");

/** A block's first line: Q<number>, then brackets, a colon, or nothing. "Q3 earnings" is not one. */
const HEADER = /^Q(\d+)(?!\d)\s*(?=\[|:|$)(.*)$/;
const SECONDS = /^(\d+)\s*s?$/i;
const LABEL = (word: string) => new RegExp(`^${word}\\s*:\\s*`, "i");

/**
 * Reads the fixed format:
 *
 *   Q1 [conflict] [120s]
 *   Question: <text, may run over several lines>
 *   Rubric:
 *   - <item>
 *
 * A block runs until the next Q line. An area outside the list becomes "other" with a warning.
 * Seconds must be 10 to 900. A block missing its question or seconds is still a row, with its
 * text kept beside it for the owner to fix. Text before the first Q line is ignored (the whole
 * paste is saved separately, verbatim).
 */
export function parseQuestionList(raw: string): ParsedList {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const blocks: { header: RegExpMatchArray; lines: string[] }[] = [];
  for (const line of lines) {
    const h = undecorate(line).match(HEADER);
    if (h) blocks.push({ header: h, lines: [line] });
    else blocks.at(-1)?.lines.push(line);
  }

  const warnings: string[] = [];
  const rows = blocks.map((b, i): ParsedQuestion => {
    const n = i + 1;
    const problems: string[] = [];
    const brackets = [...b.header[2].matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());
    if (Number(b.header[1]) !== n) warnings.push(`Q${b.header[1]} is question ${n} in the list; questions are kept in the order pasted.`);

    let area: BmArea | null = null;
    const areaText = (brackets[0] ?? "").toLowerCase();
    if (!areaText) problems.push("No area.");
    else if (isArea(areaText)) area = areaText;
    else {
      area = "other";
      warnings.push(`Question ${n}: “${brackets[0]}” isn't one of ${AREA_ORDER.join(", ")}, so its area is other.`);
    }

    let targetSeconds: number | null = null;
    const sec = (brackets[1] ?? "").match(SECONDS);
    if (!sec) problems.push("No target seconds.");
    else if (Number(sec[1]) < TARGET_MIN || Number(sec[1]) > TARGET_MAX) problems.push(`Target ${sec[1]}s is outside ${TARGET_MIN} to ${TARGET_MAX} seconds.`);
    else targetSeconds = Number(sec[1]);

    let state: "head" | "question" | "rubric" = "head";
    const question: string[] = [];
    const rubric: string[] = [];
    for (const line of b.lines.slice(1)) {
      const t = undecorate(line);
      if (LABEL("Question").test(t)) {
        state = "question";
        const rest = t.replace(LABEL("Question"), "").trim();
        if (rest) question.push(rest);
      } else if (LABEL("Rubric").test(t)) {
        state = "rubric";
        const rest = t.replace(LABEL("Rubric"), "").trim();
        if (rest.startsWith("-")) rubric.push(rest);
      } else if (state === "question") {
        if (t.trim()) question.push(line.trim());
      } else if (state === "rubric") {
        if (line.trim().startsWith("-")) rubric.push(line.trim());
      }
    }
    if (!question.length) problems.push("No question.");

    return { area, targetSeconds, question: question.join("\n"), rubric: rubric.join("\n"), block: b.lines.join("\n").trim(), problems };
  });

  return { rows, warnings };
}

// ---- The editable rows before saving ----------------------------------------------------------------

/** A question row in the preview, as the owner edits it (target as typed). */
export interface DraftQuestion {
  area: BmArea | "";
  target: string;
  question: string;
  rubric: string;
  block?: string; // the pasted block, shown beside a row that needs fixing
  problems?: string[];
}

export const draftFrom = (p: ParsedQuestion): DraftQuestion => ({
  area: p.area ?? "",
  target: p.targetSeconds == null ? "" : String(p.targetSeconds),
  question: p.question,
  rubric: p.rubric,
  block: p.problems.length ? p.block : undefined,
  problems: p.problems.length ? p.problems : undefined,
});

export const emptyDraft = (): DraftQuestion => ({ area: "", target: "", question: "", rubric: "" });

/** What save_bm_questions takes, once every row is valid. */
export interface QuestionInput {
  area: BmArea;
  question_text: string;
  rubric_text: string | null;
  target_seconds: number;
}

/** The rows ready to save, or the first reason they can't be. */
export function checkDrafts(rows: DraftQuestion[]): { ok: true; questions: QuestionInput[] } | { ok: false; error: string } {
  if (rows.length < 1) return { ok: false, error: "A mock needs at least one question." };
  if (rows.length > MAX_QUESTIONS) return { ok: false, error: `A mock has at most ${MAX_QUESTIONS} questions; remove ${rows.length - MAX_QUESTIONS}.` };
  const out: QuestionInput[] = [];
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!r.area) return { ok: false, error: `Question ${n} needs an area.` };
    if (!r.question.trim()) return { ok: false, error: `Question ${n} needs its question.` };
    const t = r.target.trim();
    if (!/^\d+$/.test(t) || Number(t) < TARGET_MIN || Number(t) > TARGET_MAX) {
      return { ok: false, error: `Question ${n}: the target must be ${TARGET_MIN} to ${TARGET_MAX} seconds.` };
    }
    out.push({ area: r.area, question_text: r.question.trim(), rubric_text: r.rubric.trim() ? r.rubric : null, target_seconds: Number(t) });
  }
  return { ok: true, questions: out };
}

// ---- Small fields --------------------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** The longest time the time field takes: a day. */
export const MAX_SECONDS = 86_400;

/** The time field: "2:35" or "155" (seconds). Blank clears it (no time recorded). */
export function parseTimeField(text: string): Parsed<number | null> {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  let s: number | null = null;
  if (/^\d+$/.test(t)) s = Number(t);
  const m = t.match(/^(\d+):([0-5]\d)$/);
  if (m) s = Number(m[1]) * 60 + Number(m[2]);
  if (s == null) return { ok: false, error: "Type a time like 2:35, or seconds like 155." };
  if (s > MAX_SECONDS) return { ok: false, error: "That's longer than a day." };
  return { ok: true, value: s };
}

/** A content score: 0 to 10 in half steps, or blank. */
export function parseContentScore(text: string): Parsed<number | null> {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, error: "A content score is 0 to 10 in half steps." };
  const v = Number(t);
  if (v > 10 || !Number.isInteger(v * 2)) return { ok: false, error: "A content score is 0 to 10 in half steps." };
  return { ok: true, value: v };
}

/** The retries counter, typed: a whole number, 0 or more. */
export function parseRetries(text: string): Parsed<number> {
  const t = text.trim();
  if (!/^\d+$/.test(t) || Number(t) > 1000) return { ok: false, error: "Retries must be a whole number, 0 or more." };
  return { ok: true, value: Number(t) };
}

// ---- Fill scores from feedback -----------------------------------------------------------------------------

export interface ScoreLine {
  position: number;
  line: string | null; // the line read, as pasted; null when none matched
  value: number | null; // rounded to the nearest half; null when unreadable or out of 0-10
}

const SCORE = /(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/;

/**
 * For each question number, the first feedback line that begins with Q<number> (Markdown
 * decoration aside) and contains a score written as <number>/10. The value is rounded to the
 * nearest half and must be 0 to 10, or it stays blank. Nothing is applied here: the caller
 * shows these and applies them only when the owner confirms.
 */
export function readScoreLines(feedback: string, positions: number[]): ScoreLine[] {
  const lines = feedback.replace(/\r\n?/g, "\n").split("\n");
  return positions.map((n) => {
    const starts = new RegExp(`^Q${n}(?!\\d)`);
    const line = lines.find((l) => starts.test(undecorate(l)) && SCORE.test(l));
    if (line == null) return { position: n, line: null, value: null };
    const raw = Number(line.match(SCORE)![1]);
    const value = Math.round(raw * 2) / 2;
    return { position: n, line: line.trim(), value: value >= 0 && value <= 10 ? value : null };
  });
}
