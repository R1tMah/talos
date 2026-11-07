// Behavioral mocks: the parts that are plain code. The areas a mock covers, the models the
// owner can pick, the Yap Penalty (worked out here from the timer, never by the model), and
// the things copied to the clipboard: the scorecards and the "second opinion" prompt. Pure.

/** The six behavioral areas: one question each, in this order, in every mock. */
export const BUCKETS = [
  "Conflict & Disagreement",
  "Failure & Growth",
  "Navigating Ambiguity",
  "Leadership & Influence",
  "Ownership & Delivering Results",
  "Collaboration & Teamwork",
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** The optional 7th question, asked last: why this company and role. */
export const FIT_AREA = "Motivation & Fit" as const;
export type Area = Bucket | typeof FIT_AREA;

/** "Stripe, Product Engineer", or just the role when no company was given. */
export const mockName = (company: string, role: string) => (company.trim() ? `${company.trim()}, ${role}` : role);

/** A mock's areas, in the order they're asked. */
export const areasFor = (includeFit: boolean): Area[] => [...BUCKETS, ...(includeFit ? [FIT_AREA] : [])];

/** The mock's overall score: the mean of the answered questions' final scores, to one decimal. Null with none answered. */
export function overall(finals: number[]): number | null {
  if (!finals.length) return null;
  return Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 10) / 10;
}

/** The models Settings offers for each role. The database accepts exactly these. */
export const MOCK_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
] as const;
export type MockModel = (typeof MOCK_MODELS)[number]["id"];
export const isMockModel = (v: unknown): v is MockModel => MOCK_MODELS.some((m) => m.id === v);
export const modelLabel = (id: string) => MOCK_MODELS.find((m) => m.id === id)?.label ?? id;
export const DEFAULT_MODELS = { architect: "claude-sonnet-5-5", grader: "claude-haiku-5-5" } as const satisfies Record<string, MockModel>;

/** Answer lengths the Architect may ask for; anything outside is clamped. */
export const TARGET_MIN = 60;
export const TARGET_MAX = 300;
export const clampTarget = (n: unknown) => {
  // Missing or not a number: a typical two-minute answer.
  if (n == null || n === "") return 120;
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(TARGET_MAX, Math.max(TARGET_MIN, v)) : 120;
};

// ---- The Yap Penalty -----------------------------------------------------------------

/** One point off for every full 15 seconds past the target, at most 3. */
export const YAP_STEP_SECONDS = 15;
export const YAP_MAX = 3;

export function yapPenalty(durationSeconds: number, targetSeconds: number): number {
  const over = Math.max(0, Math.floor(durationSeconds) - targetSeconds);
  return Math.min(YAP_MAX, Math.floor(over / YAP_STEP_SECONDS));
}

/** The model's content score (0–10) less the penalty, never below 0. */
export const finalScore = (content: number, penalty: number) => Math.max(0, Math.min(10, content) - penalty);

/** "2:35" */
export const fmtClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---- What gets copied ----------------------------------------------------------------

export interface Rubric {
  requirements: string[]; // what a strong answer must do, each checkable
  strong_signals: string[];
  red_flags: string[];
}

export interface Graded {
  content: number; // 0–10, the model's grade of the content alone
  checks: { requirement: string; met: boolean; note: string }[];
  worked: string;
  failed: string;
  tip: string;
}

export interface ScorecardInput {
  n?: number; // its number in the session, for "Q2:"
  company: string;
  role: string;
  bucket: string;
  question: string;
  target: number;
  duration: number;
  graded: Graded;
}

/** The Markdown scorecard, for Journals or Obsidian. */
export function scorecard(s: ScorecardInput): string {
  const penalty = yapPenalty(s.duration, s.target);
  const score = finalScore(s.graded.content, penalty);
  const time = `Target Time: ${s.target}s | Your Time: ${Math.floor(s.duration)}s${penalty ? ` (Yap Penalty: -${penalty} ${penalty === 1 ? "pt" : "pts"})` : ""}`;
  const lines = [
    `**Q${s.n ?? 1}: ${s.question}**`,
    [s.company.trim(), s.role, s.bucket].filter(Boolean).join(" · "),
    "",
    time,
    "",
    `Score: ${score}/10${penalty ? ` (content ${s.graded.content}/10)` : ""}`,
    "",
    `What Worked: ${s.graded.worked}`,
    "",
    `What Failed: ${s.graded.failed}`,
  ];
  if (s.graded.tip) lines.push("", `Next Time: ${s.graded.tip}`);
  if (s.graded.checks.length) {
    lines.push("", "Rubric:", ...s.graded.checks.map((c) => `- [${c.met ? "x" : " "}] ${c.requirement}${c.note ? ` (${c.note})` : ""}`));
  }
  return lines.join("\n");
}

export interface MockScorecardInput {
  company: string;
  role: string;
  date: string; // "Nov 7"
  /** Every question in order; `graded` and `duration` are null for one not answered. */
  questions: { area: string; question: string; target: number; duration: number | null; graded: Graded | null }[];
}

/** The whole mock as Markdown: the overall score, then each question's scorecard. */
export function mockScorecard(m: MockScorecardInput): string {
  const answered = m.questions.filter((q) => q.graded && q.duration != null);
  const finals = answered.map((q) => finalScore(q.graded!.content, yapPenalty(q.duration!, q.target)));
  const avg = overall(finals);
  const head = [
    `# Behavioral mock: ${mockName(m.company, m.role)} (${m.date})`,
    "",
    avg == null ? "Overall: no answers graded yet" : `Overall: ${avg}/10 across ${answered.length} of ${m.questions.length} questions`,
    "",
    ...m.questions.map((q, i) => {
      if (!q.graded || q.duration == null) return `- Q${i + 1} ${q.area}: not answered`;
      const p = yapPenalty(q.duration, q.target);
      return `- Q${i + 1} ${q.area}: ${finalScore(q.graded.content, p)}/10${p ? ` (Yap -${p})` : ""}`;
    }),
  ];
  const cards = m.questions.flatMap((q, i) =>
    q.graded && q.duration != null
      ? [scorecard({ n: i + 1, company: m.company, role: m.role, bucket: q.area, question: q.question, target: q.target, duration: q.duration, graded: q.graded })]
      : [],
  );
  return [head.join("\n"), ...cards].join("\n\n---\n\n");
}

export interface ExternalInput {
  company: string;
  role: string;
  bucket: string;
  question: string;
  rubric: Rubric;
  target: number;
  duration: number;
  transcription: string;
}

/** A self-contained grading prompt to paste into another model, for a second opinion. */
export function externalPrompt(e: ExternalInput): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none given)");
  return [
    `You are a senior hiring manager at a top tech company grading one behavioral interview answer. Be strict and specific.`,
    "",
    e.company.trim() ? `Company and role: ${e.company.trim()}, ${e.role}` : `Role: ${e.role} (no specific company)`,
    `Behavioral area: ${e.bucket}`,
    `Question: ${e.question}`,
    "",
    "Rubric. A strong answer must:",
    list(e.rubric.requirements),
    "",
    "Strong signals:",
    list(e.rubric.strong_signals),
    "",
    "Red flags:",
    list(e.rubric.red_flags),
    "",
    `Timing: the target length was ${e.target} seconds; the candidate spoke for ${Math.floor(e.duration)} seconds. ` +
      `Deduct 1 point for every full ${YAP_STEP_SECONDS} seconds over the target, at most ${YAP_MAX}.`,
    "",
    "The answer, transcribed from speech (expect dictation errors and filler words):",
    '"""',
    e.transcription,
    '"""',
    "",
    "Grade it out of 10. Use STAR (Situation, Task, Action, Result) and the rubric. Give: the score before and after the timing deduction, " +
      "which rubric points were met and which weren't, what worked, what failed, and one concrete change that would raise the score most.",
  ].join("\n");
}
