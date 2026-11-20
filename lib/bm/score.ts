// Behavioral mocks v2: the arithmetic. The Yap Penalty, the final and overall scores, how a
// time reads against its target, the stopwatch's display, and the copied scorecard. Pure, and
// the same rules as the database's bm_question_scores view, so both always agree.
// Missing is not zero: no time recorded means no penalty; no content score means no final score.

import { AREA_LABELS, AREA_ORDER, type BmArea } from "./areas";

/** One point off for every full 15 seconds past the target, at most 3. */
export const YAP_STEP_SECONDS = 15;
export const YAP_MAX = 3;

/** The Yap Penalty, or null with no time recorded. Under the target costs nothing. */
export function yapPenalty(actualSeconds: number | null, targetSeconds: number): number | null {
  if (actualSeconds == null) return null;
  const over = Math.max(0, Math.floor(actualSeconds) - targetSeconds);
  return Math.min(YAP_MAX, Math.floor(over / YAP_STEP_SECONDS));
}

/** Content less the penalty (none when no time was recorded), never below 0. Null with no content score. */
export function finalScore(content: number | null, penalty: number | null): number | null {
  if (content == null) return null;
  return Math.max(0, content - (penalty ?? 0));
}

/**
 * The average of the final scores that exist, to one decimal (halves round up, as Postgres's
 * round does for these positive values). Null ("no data") with none. Worked in whole halves so
 * float error can't move a .x5 the wrong way.
 */
export function overallScore(finals: (number | null)[]): number | null {
  const xs = finals.filter((f): f is number => f != null);
  if (!xs.length) return null;
  const halves = xs.reduce((a, f) => a + Math.round(f * 2), 0);
  return Math.round((halves * 5) / xs.length) / 10;
}

/** "2:35" (minutes:seconds). */
export function fmtMmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "+0:23 over target", "under target", "on target", or "no time recorded". */
export function timeVsTarget(actualSeconds: number | null, targetSeconds: number): string {
  if (actualSeconds == null) return "no time recorded";
  if (actualSeconds > targetSeconds) return `+${fmtMmss(actualSeconds - targetSeconds)} over target`;
  return actualSeconds < targetSeconds ? "under target" : "on target";
}

/** What a card shows after Stop: "+0:23 over target, penalty 1", or "under target". */
export function stopLine(actualSeconds: number | null, targetSeconds: number): string {
  const vs = timeVsTarget(actualSeconds, targetSeconds);
  return actualSeconds != null && actualSeconds > targetSeconds ? `${vs}, penalty ${yapPenalty(actualSeconds, targetSeconds)}` : vs;
}

/**
 * A running stopwatch's seconds, from its stored start (the database clock) and this device's
 * clock corrected by `skewMs` (database now minus device now, when known). Never counted up.
 */
export function elapsedSeconds(startedAtIso: string, nowMs: number, skewMs = 0): number {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((nowMs + skewMs - started) / 1000));
}

/** "7", "7.5": a score as typed, never "7.0". */
export const fmtScore = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// ---- One question's numbers --------------------------------------------------------------------------

export interface ScoredQuestion {
  position: number;
  area: BmArea;
  target_seconds: number;
  actual_seconds: number | null;
  retries: number;
  content_score: number | null;
}

export interface QuestionNumbers {
  penalty: number | null;
  final: number | null;
}

export const numbersOf = (q: Pick<ScoredQuestion, "actual_seconds" | "target_seconds" | "content_score">): QuestionNumbers => {
  const penalty = yapPenalty(q.actual_seconds, q.target_seconds);
  return { penalty, final: finalScore(q.content_score, penalty) };
};

/** A mock's overall score from its questions. Retries never enter into it. */
export const sessionOverall = (qs: Pick<ScoredQuestion, "actual_seconds" | "target_seconds" | "content_score">[]) =>
  overallScore(qs.map((q) => numbersOf(q).final));

// ---- Copy scorecard -----------------------------------------------------------------------------------------

const cell = (v: string) => v.replace(/\|/g, "\\|");

/**
 * The scorecard: a Markdown table of each question's numbers and the overall score, then the
 * pasted feedback exactly as pasted. Nothing else.
 */
export function scorecardMarkdown(qs: ScoredQuestion[], feedback: string | null): string {
  const rows = [...qs].sort((a, b) => a.position - b.position);
  const overall = sessionOverall(rows);
  const lines = [
    "| Q | Area | Time | Target | Retries | Content | Penalty | Final |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((q, i) => {
      const n = numbersOf(q);
      return `| ${[
        `Q${i + 1}`,
        AREA_LABELS[q.area],
        q.actual_seconds == null ? "no time recorded" : fmtMmss(q.actual_seconds),
        fmtMmss(q.target_seconds),
        String(q.retries),
        q.content_score == null ? "–" : fmtScore(q.content_score),
        n.penalty == null ? "–" : String(n.penalty),
        n.final == null ? "–" : fmtScore(n.final),
      ].map(cell).join(" | ")} |`;
    }),
    `| Overall | | | | | | | ${overall == null ? "no data" : overall.toFixed(1)} |`,
  ];
  const table = lines.join("\n");
  return feedback ? `${table}\n\n${feedback}` : table;
}

// ---- Trends -----------------------------------------------------------------------------------------------------

export interface AreaTrendRow {
  area: string;
  scored: number;
  avg_final: number | null;
}

export interface AreaBar {
  area: BmArea;
  label: string;
  value: number | null; // average final score; null: "no data"
  scored: number;
}

/** Average final score by area, in the fixed area order, every area present ("no data" when none scored). "other" only when used. */
export function areaBars(rows: AreaTrendRow[]): AreaBar[] {
  const by = new Map(rows.map((r) => [r.area, r]));
  const areas: BmArea[] = [...AREA_ORDER, ...(by.has("other") ? (["other"] as const) : [])];
  return areas.map((area) => {
    const r = by.get(area);
    const value = r && r.scored > 0 && r.avg_final != null ? Number(r.avg_final) : null;
    return { area, label: AREA_LABELS[area], value, scored: r?.scored ?? 0 };
  });
}

/** The last `n` overall scores, oldest first, from mocks listed newest first. Mocks with no score are skipped. */
export function recentOverall<T extends { overall: number | null }>(newestFirst: T[], n = 5): T[] {
  return newestFirst.filter((s) => s.overall != null).slice(0, n).reverse();
}

/** "40%" from a count over a count; null ("no data") with nothing to count. */
export const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : null);
