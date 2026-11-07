// The Architect: one heavy call to a high-reasoning model that writes a whole curriculum
// (or, on Recalibrate, the rest of one) as strict JSON, Mermaid diagrams included, so the
// screens only ever render what was written here. Server-side only.

import Anthropic from "@anthropic-ai/sdk";
import type { ModuleDraft } from "./types";

export const ARCHITECT_MODEL = "claude-sonnet-5-5";

// ---- Output schema (structured outputs; code re-checks everything after parsing) ------

const MODULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "objective", "bullets", "diagram", "diagram_caption", "opening_question"],
  properties: {
    title: { type: "string", description: "Short module title, e.g. 'The Broker'." },
    objective: { type: "string", description: "One or two sentences: what the learner can explain or do once they've got it. The tutor judges completion against this." },
    bullets: { type: "array", items: { type: "string" }, description: "3 or 4 bullets defining the core concept, each under 25 words." },
    diagram: { type: "string", description: "Mermaid source for one diagram that anchors the concept. Raw Mermaid only: no ``` fences." },
    diagram_caption: { type: "string", description: "One line saying what the diagram shows." },
    opening_question: { type: "string", description: "The tutor's first question, pointing at something specific in the diagram." },
  },
} as const;

const CURRICULUM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "goal", "modules"],
  properties: {
    title: { type: "string", description: "Curriculum title, a few words." },
    goal: { type: "string", description: "One sentence: where the learner ends up." },
    modules: { type: "array", items: MODULE_SCHEMA },
  },
} as const;

const RECALIBRATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["modules"],
  properties: { modules: { type: "array", items: MODULE_SCHEMA } },
} as const;

// ---- Prompts ---------------------------------------------------------------------------

const DESIGN_RULES = `Each module is one 20–30 minute session taught by a Socratic tutor in a chat, next to the module's diagram and bullets. The learner sees only the diagram, the caption and the bullets; everything else is learned by answering the tutor's questions. So:
- One core idea per module. Order modules so each builds on the ones before it.
- bullets: 3 or 4, scannable definitions of the core concept. No filler.
- objective: concrete and checkable through conversation ("can explain why partitions allow parallel consumers and what ordering guarantee is lost").
- opening_question: refers to something visible in the diagram by its label, and can be answered by thinking rather than recall.
- diagram: the single picture that best anchors the idea.

Mermaid rules (the diagrams are rendered by Mermaid 11 exactly as written, so they must parse):
- Use only: flowchart (TD or LR), sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram.
- No styling, classDef, click handlers, HTML, icons, init directives or comments.
- Node ids are plain words (A, broker, p1). Put every label in double quotes: broker["Broker 1"], or for edges A -->|"sends"| B.
- Never use the words end, graph or subgraph as node ids. No parentheses, brackets or quotes inside labels.
- At most about 12 nodes or 10 messages; short labels.`;

const CREATE_SYSTEM = `You are the Architect of a personal learning app. You design a complete curriculum for one learner from their topic and starting point, as JSON matching the given schema.

Pick the number of modules the topic actually needs for this learner (usually 6 to 16): start from what they already know, skip what they don't need, and end at genuine working understanding.

${DESIGN_RULES}`;

const RECALIBRATE_SYSTEM = `You are the Architect of a personal learning app. A learner got stuck partway through a curriculum you designed. You get the curriculum, the module they're stuck on, their chat with the tutor, and the modules that were still to come. Rewrite everything from the stuck module onward as smaller, gentler steps, as JSON matching the given schema.

Read the chat to find exactly where their mental model broke down. Start one step before that point, with more concrete diagrams and simpler questions, then rebuild to the same end point the remaining modules were heading for. Don't repeat modules they already finished.

${DESIGN_RULES}`;

// ---- Validation --------------------------------------------------------------------------

const DIAGRAM_START = /^(flowchart\s+(TD|TB|LR|RL|BT)|graph\s+(TD|TB|LR|RL|BT)|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram)\b/;

/** Strips fences the model may still add, and trims. */
export function cleanDiagram(src: string) {
  return src.replace(/^\s*```(?:mermaid)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/** A module the screens can render, or a reason it can't be used. */
export function checkModule(m: unknown): ModuleDraft | string {
  const o = m as Partial<ModuleDraft> | null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!o || typeof o !== "object") return "module is not an object";
  const title = str(o.title), objective = str(o.objective), question = str(o.opening_question);
  const bullets = Array.isArray(o.bullets) ? o.bullets.map(str).filter(Boolean).slice(0, 4) : [];
  const diagram = cleanDiagram(str(o.diagram));
  if (!title || !objective || !question) return "module is missing a title, objective or opening question";
  if (!bullets.length) return `"${title}" has no bullets`;
  if (!DIAGRAM_START.test(diagram)) return `"${title}" has no usable diagram`;
  return { title, objective, bullets, diagram, diagram_caption: str(o.diagram_caption), opening_question: question };
}

export function checkModules(list: unknown): ModuleDraft[] | string {
  if (!Array.isArray(list) || !list.length) return "no modules";
  if (list.length > 40) return "too many modules";
  const out: ModuleDraft[] = [];
  for (const m of list) {
    const c = checkModule(m);
    if (typeof c === "string") return c;
    out.push(c);
  }
  return out;
}

// ---- The call ----------------------------------------------------------------------------

let client: Anthropic | null = null;
// Long outputs: streamed, with room for a slow first token; one retry on connection errors.
const anthropic = () => (client ??= new Anthropic({ timeout: 280_000, maxRetries: 1 }));

export type ArchitectResult<T> = { ok: true; value: T; message: Anthropic.Beta.BetaMessage } | { ok: false; error: string; message?: Anthropic.Beta.BetaMessage };

async function callArchitect(system: string, user: string, schema: object): Promise<ArchitectResult<unknown>> {
  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = anthropic().beta.messages.stream({
      model: ARCHITECT_MODEL,
      max_tokens: 64000,
      // On a policy decline the API re-runs the request on a fallback model inside this call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
      system,
      messages: [{ role: "user", content: user }],
    });
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The model is busy right now. Try again in a minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `The model call failed (${e.status ?? "network"}).` };
    return { ok: false, error: "The model call failed." };
  }
  if (message.stop_reason === "refusal") return { ok: false, error: "The model declined to write this curriculum.", message };
  if (message.stop_reason === "max_tokens") return { ok: false, error: "The curriculum came back cut off. Try a narrower topic.", message };
  const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
  try {
    return { ok: true, value: JSON.parse(text), message };
  } catch {
    return { ok: false, error: "The curriculum came back in a form Talos couldn't read.", message };
  }
}

export interface DesignInput {
  topic: string;
  context: string;
  cadenceLabel: string;
  /** With a "finish by" date: the date and how many sessions fit before it. */
  deadline?: { date: string; sessions: number } | null;
}

/** The schedule line for the prompt, with the session budget when there's a deadline. */
const scheduleLine = (cadence: string, deadline?: { date: string; sessions: number } | null) =>
  deadline
    ? `Schedule: ${cadence}, one module per session. I want to finish by ${deadline.date}, which leaves exactly ${deadline.sessions} sessions. ` +
      `Use at most ${deadline.sessions} modules. If the topic needs more than that, cover what matters most for my goal and leave out the rest.`
    : `Schedule: ${cadence}, one module per session.`;

/** A whole new curriculum. */
export async function designCurriculum(input: DesignInput): Promise<ArchitectResult<{ title: string; goal: string; modules: ModuleDraft[] }>> {
  const user = `Topic: ${input.topic}\n\nWhere I'm starting from: ${input.context || "(not given)"}\n\n${scheduleLine(input.cadenceLabel, input.deadline)}`;
  const res = await callArchitect(CREATE_SYSTEM, user, CURRICULUM_SCHEMA);
  if (!res.ok) return res;
  const v = res.value as { title?: unknown; goal?: unknown; modules?: unknown };
  const modules = checkModules(v.modules);
  if (typeof modules === "string") return { ok: false, error: `The curriculum wasn't usable: ${modules}.`, message: res.message };
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim() : input.topic;
  return { ok: true, value: { title, goal: typeof v.goal === "string" ? v.goal.trim() : "", modules }, message: res.message };
}

export interface RecalibrateInput {
  topic: string;
  context: string;
  title: string;
  goal: string;
  finished: string[]; // titles of modules already finished
  stuck: ModuleDraft;
  transcript: { role: "user" | "assistant"; content: string }[];
  remaining: ModuleDraft[]; // modules after the stuck one that were still to come
  /** With a "finish by" date: the date and how many sessions are left before it, from today. */
  deadline?: { date: string; sessions: number } | null;
}

/** Gentler replacements for the stuck module and everything after it. */
export async function recalibrate(input: RecalibrateInput): Promise<ArchitectResult<ModuleDraft[]>> {
  const mod = (m: ModuleDraft) => `## ${m.title}\nObjective: ${m.objective}\nBullets:\n${m.bullets.map((b) => `- ${b}`).join("\n")}\nDiagram:\n${m.diagram}`;
  const chat = input.transcript.length
    ? input.transcript.map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.content}`).join("\n\n")
    : "(The learner hasn't written anything yet; they asked to recalibrate straight away.)";
  const user = [
    `Curriculum: ${input.title}\nGoal: ${input.goal}\nTopic: ${input.topic}\nLearner's starting point: ${input.context || "(not given)"}`,
    `Finished modules: ${input.finished.length ? input.finished.join("; ") : "(none)"}`,
    `# Stuck on this module\n${mod(input.stuck)}`,
    `# Chat with the tutor on it\n${chat}`,
    `# Modules that were still to come\n${input.remaining.length ? input.remaining.map(mod).join("\n\n") : "(none: this was the last module)"}`,
    input.deadline
      ? `# Deadline\nThe learner wants to finish by ${input.deadline.date}: ${input.deadline.sessions} sessions left from today. ` +
        `Fit the new modules into at most ${Math.max(1, input.deadline.sessions)} if you can; if gentler steps truly need more, use what's needed and keep the count as low as you can.`
      : "",
  ].filter(Boolean).join("\n\n");
  const res = await callArchitect(RECALIBRATE_SYSTEM, user, RECALIBRATION_SCHEMA);
  if (!res.ok) return res;
  const modules = checkModules((res.value as { modules?: unknown }).modules);
  if (typeof modules === "string") return { ok: false, error: `The new modules weren't usable: ${modules}.`, message: res.message };
  return { ok: true, value: modules, message: res.message };
}
