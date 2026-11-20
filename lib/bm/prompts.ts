// Behavioral mocks v2: the three prompts the owner copies into Claude, and the code that
// fills their placeholders. Pure: no model is called anywhere in this feature.
//
// The default text lives here, once. Settings stores an edited copy in
// settings.bm_prompt_questions / _interviewer / _grader; null there means "use the default".

export type PromptKey = "questions" | "interviewer" | "grader";

/** 1. Question writer: run once in a normal chat. Its fixed format is what the parser reads. */
const QUESTIONS = `You are writing a behavioral mock interview for a new-grad software engineer. Role: {{role}}. Company: {{company}}.

JOB DESCRIPTION
{{job_description}}

Write exactly one question for each area, in this order: conflict, failure, ambiguity, leadership, ownership, teamwork. {{why_company_line}}

Each question must sound like a real interviewer asking it, fit this role and job description, and be answerable from internships, projects, or school. No textbook wording.

Give each question a target answer length in seconds (usually 90 to 150) and a rubric of 4 or 5 specific things a strong answer shows. Do not write sample answers.

Format every question exactly like this, with nothing between questions:

Q1 [conflict] [120s]
Question: <the question>
Rubric:
- <item>
- <item>

Use these area names: conflict, failure, ambiguity, leadership, ownership, teamwork, why_company.`;

/** 2. Interviewer: for Claude's voice mode. */
const INTERVIEWER = `Act as a behavioral interviewer in a voice mock. Ask these questions one at a time, in order, exactly as written:

{{questions}}

Rules:
- Ask one question, then stay silent until I finish. I will say "done" when I am finished.
- After I say "done", reply only with "Thanks. Next question." and ask the next one.
- Do not coach, react, comment, or give feedback during the interview, even if I ask.
- If I say "repeat", read the question again.
- After the last question, say "That is all the questions" and wait. I will ask for grading separately.`;

/** 3. Grader: in the same chat after the last question, or in another model for a second opinion. */
const GRADER = `Grade the answers I just gave. Here are the questions and rubrics:

{{questions_with_rubrics}}

For each question give:
- A content score from 0 to 10 against the rubric. Ignore length, because I time myself separately.
- Which rubric items I hit and which I missed, quoting my own words as evidence.
- One specific change that would make the answer stronger.

Be strict, and no vague praise. Start each question with a line in this form: Q<number> <area> <score>/10. Then give the average content score and the two weakest patterns across all my answers.`;

export const DEFAULT_PROMPTS: Record<PromptKey, string> = { questions: QUESTIONS, interviewer: INTERVIEWER, grader: GRADER };

export const PROMPT_LABELS: Record<PromptKey, { title: string; hint: string }> = {
  questions: { title: "Question writer", hint: "Run once in a normal chat. Keep its output format: the question reader depends on it." },
  interviewer: { title: "Interviewer", hint: "For Claude's voice mode." },
  grader: { title: "Grader", hint: "Keep the line “Q<number> <area> <score>/10”: Fill scores from feedback reads it." },
};

/** The stored text, or the default when none is stored (null or blank). */
export const effectivePrompt = (key: PromptKey, stored: string | null | undefined) =>
  stored != null && stored.trim() !== "" ? stored : DEFAULT_PROMPTS[key];

/** The sentence {{why_company_line}} becomes when "Why this company?" is on. */
export const WHY_COMPANY_LINE = "Then write a seventh question for the area why_company: why this company and this role.";

export const PLACEHOLDERS = ["role", "company", "job_description", "why_company_line", "questions", "questions_with_rubrics"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

const PATTERN = new RegExp(`\\{\\{(${PLACEHOLDERS.join("|")})\\}\\}`, "g");

/**
 * Replaces the listed placeholders, everywhere they appear, with the exact text given (a
 * placeholder with no value given becomes ""). Any other {{...}} is left alone, and text put
 * in is never itself scanned for placeholders or `$` patterns.
 */
export function fillPrompt(template: string, values: Partial<Record<Placeholder, string>>): string {
  return template.replace(PATTERN, (_m, name: Placeholder) => values[name] ?? "");
}

export interface PromptQuestion {
  position: number;
  area: string;
  question_text: string;
  rubric_text: string | null;
  target_seconds: number;
}

const inOrder = (qs: PromptQuestion[]) => [...qs].sort((a, b) => a.position - b.position);

/** {{questions}}: the questions in order, numbered, with no rubrics. */
export const questionsList = (qs: PromptQuestion[]) => inOrder(qs).map((q, i) => `${i + 1}. ${q.question_text}`).join("\n");

/** {{questions_with_rubrics}}: each question in the question writer's format, rubric verbatim. */
export const questionsWithRubrics = (qs: PromptQuestion[]) =>
  inOrder(qs)
    .map((q, i) => [`Q${i + 1} [${q.area}] [${q.target_seconds}s]`, `Question: ${q.question_text}`, "Rubric:", q.rubric_text?.trim() ? q.rubric_text : "(none saved)"].join("\n"))
    .join("\n\n");

export interface SetupValues {
  role: string;
  company: string;
  jobDescription: string;
  whyCompany: boolean;
}

/** Prompt 1, filled from the setup screen. */
export const questionPrompt = (template: string, s: SetupValues) =>
  fillPrompt(template, {
    role: s.role,
    company: s.company,
    job_description: s.jobDescription,
    why_company_line: s.whyCompany ? WHY_COMPANY_LINE : "",
  });

/** Prompts 2 and 3 (and any other placeholder a custom prompt uses), filled from a saved mock. */
export const sessionPrompt = (
  template: string,
  s: { role: string; company: string | null; job_description: string | null },
  qs: PromptQuestion[],
) =>
  fillPrompt(template, {
    role: s.role,
    company: s.company ?? "",
    job_description: s.job_description ?? "",
    why_company_line: qs.some((q) => q.area === "why_company") ? WHY_COMPANY_LINE : "",
    questions: questionsList(qs),
    questions_with_rubrics: questionsWithRubrics(qs),
  });
