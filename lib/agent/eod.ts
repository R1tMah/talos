// End of day: turning the owner's answers into entries for the EOD card.
//
// Journal and note answers from the interview are saved exactly as typed; the model
// is never asked about them. The model is used only to find purchases in a spending
// answer, or to split a one-shot "EOD: ..." message into its parts. Whatever it
// returns is checked like every other chat write: text has to be the owner's own
// words, and an amount has to be a number they typed.

import type Anthropic from "@anthropic-ai/sdk";
import { isSpendCategory, SPEND_CATEGORIES } from "@/lib/spending";
import { isSkip, isToolTarget, targetLabel, type EodAnswer, type EodDraft, type EodEntry, type EodNoteKind, type EodSpend, type EodTarget, type EodToolTarget } from "@/lib/eod";
import type { ChatTab } from "@/lib/tabs";
import { anthropic, callModel, logUsage, MODEL, settleApplications } from "./run";
import { TAB_TOOLS } from "./scope";
import { TOOLS, typed, verbatim, type Check, type Ctx, type Db, type Resolved } from "./tools";

/** What the model hands back. Every field is checked before it reaches the card. */
export interface Extraction {
  work_journal: string | null;
  personal_journal: string | null;
  content_idea: string | null;
  talos_idea: string | null;
  spending: { amount: number | null; what: string; category: string }[];
}

const FIELD: Record<EodNoteKind, keyof Omit<Extraction, "spending">> = {
  journal: "work_journal",
  personal: "personal_journal",
  content: "content_idea",
  talos: "talos_idea",
};

const TOOL: Anthropic.Tool = {
  name: "record_eod",
  description: "Record the owner's end-of-day entries, sorted by where each goes.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["work_journal", "personal_journal", "content_idea", "talos_idea", "spending"],
    properties: {
      work_journal: { type: ["string", "null"], description: "What got done, learned or decided at work, copied exactly. Null if none." },
      personal_journal: { type: ["string", "null"], description: "Personal, non-work thoughts or feelings, copied exactly. Null if none." },
      content_idea: { type: ["string", "null"], description: "An idea for content to make, copied exactly. Null if none." },
      talos_idea: { type: ["string", "null"], description: "An idea or fix for the Talos app, copied exactly. Null if none." },
      spending: {
        type: "array",
        description: "One item per purchase. Empty if nothing was bought.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["amount", "what", "category"],
          properties: {
            amount: { type: ["number", "null"], description: "The amount exactly as typed (12 for '$12'). Null if no amount was given." },
            what: { type: "string", description: "What was bought, copied exactly as written, without the amount." },
            category: { type: "string", enum: [...SPEND_CATEGORIES] },
          },
        },
      },
    },
  },
};

const SYSTEM =
  "You sort a person's end-of-day message into entries by calling record_eod exactly once. " +
  "Copy every text span exactly as the person wrote it: never rewrite, summarize, correct or add words. " +
  "A span can only go in one field. Leave a field null, or spending empty, when nothing fits. " +
  "Spending is money the person spent today; use the amount exactly as typed.";

/** One model call. Null when the model can't be reached or doesn't answer with the tool. */
export async function extract(db: Db, text: string): Promise<Extraction | null> {
  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `<message>\n${text}\n</message>` }],
    });
    await logUsage({ db }, res);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name);
    return call ? (call.input as Extraction) : null;
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error(`[eod] model call failed: ${err.status ?? ""} ${String(err.message ?? e).slice(0, 300)}`);
    return null;
  }
}

/** Purchases from the model that the owner really typed: their amount and their words. */
function spendingFrom(ex: Extraction | null, text: string): EodSpend[] {
  const out: EodSpend[] = [];
  for (const s of ex?.spending ?? []) {
    const what = verbatim(s.what, text);
    if (!what || !typed(s.amount, text) || s.amount <= 0) continue;
    out.push({ amount: Math.round(s.amount * 100) / 100, what: what.trim(), category: isSpendCategory(s.category) ? s.category : "Other" });
  }
  return out;
}

/** Does this answer need the model? Only a spending answer that isn't a skip. */
export const needsModel = (answers: EodAnswer[]) => answers.some((a) => a.target === "spending" && !isSkip(a.text));

/** The spending answers, as one block for the model and for checking against. */
export const spendingText = (answers: EodAnswer[]) =>
  answers.filter((a) => a.target === "spending" && !isSkip(a.text)).map((a) => a.text.trim()).join("\n");

/**
 * The card's entries from interview answers. Notes and own-log answers are the owner's
 * answer as typed; spending is what the model found in the spending answers, checked
 * against them. `prompts`: the own-log questions' wording by id, read from the database.
 */
export function draftFromAnswers(answers: EodAnswer[], ex: Extraction | null, prompts: ReadonlyMap<string, string> = new Map()): EodDraft {
  const draft: EodDraft = { notes: [], spending: [], answers: [], unclear: [] };
  for (const a of answers) {
    const text = a.text.trim();
    // Spending is read below; a tab's answer is read with that tab's tools (readTabAnswers).
    if (!text || isSkip(text) || a.target === "spending" || isToolTarget(a.target)) continue;
    if (a.target === "custom") {
      const prompt = a.questionId ? prompts.get(a.questionId) : undefined;
      if (prompt) draft.answers.push({ questionId: a.questionId!, prompt, body: text });
      else draft.unclear.push(`That question was removed, so "${text}" isn't saved.`);
      continue;
    }
    draft.notes.push({ kind: a.target, body: text });
  }
  const spend = spendingText(answers);
  if (spend) {
    draft.spending = spendingFrom(ex, spend);
    if (!draft.spending.length) draft.unclear.push(`Spending: couldn't find an amount in "${spend}"`);
  }
  return draft;
}

/**
 * The card's entries from a one-shot "EOD: ..." message: the model splits it, and only
 * targets that are asked about (and not archived) are kept.
 */
export function draftFromOneShot(text: string, ex: Extraction | null, allowed: ReadonlySet<EodTarget>): EodDraft {
  // Own-log questions are only asked in the interview: a one-shot can't tell which part answers them.
  const draft: EodDraft = { notes: [], spending: [], answers: [], unclear: [] };
  for (const [kind, field] of Object.entries(FIELD) as [EodNoteKind, keyof Omit<Extraction, "spending">][]) {
    if (!allowed.has(kind)) continue;
    const body = verbatim(ex?.[field], text);
    if (body?.trim()) draft.notes.push({ kind, body: body.trim() });
  }
  if (allowed.has("spending")) draft.spending = spendingFrom(ex, text);
  if (!draft.notes.length && !draft.spending.length) draft.unclear.push(`Couldn't sort "${text}" into entries.`);
  return draft;
}

// ---- Tab answers: read with that tab's chat tools ------------------------------------------

/** The chat tools an answer for each tab may use (its chip's tools; reminders aren't a chip). */
export const toolsFor = (t: EodToolTarget): readonly string[] =>
  t === "reminders" ? ["add_reminder", "add_long_term_reminder"] : TAB_TOOLS[t as ChatTab];

/** A tab entry ready for Save EOD: the checked write, and how the card shows it. */
export interface TabEntry {
  tool: string;
  resolved: Resolved;
  card: EodEntry;
}

/** What one checked call adds to the card: an entry, or a line saying why it can't be saved yet. Pure, for tests. */
export function fromCheck(target: EodTarget, tool: string, check: Check): { entry?: TabEntry; unclear?: string } {
  const label = targetLabel(target);
  const inChat = `Log it in Chat with the ${label} chip.`;
  if (check.status === "invalid") return { unclear: `${label}: ${check.detail}` };
  if (check.status === "missing") return { unclear: `${label}: ${check.title} needs ${check.missing.map((m) => m.label.toLowerCase()).join(", ")}. ${inChat}` };
  if (check.status === "ambiguous") {
    const q = check.title?.trim() || "Couldn't tell which one you meant.";
    return { unclear: `${label}: ${/[.?!]$/.test(q) ? q : `${q}.`} ${inChat}` };
  }
  const entry: TabEntry = { tool, resolved: check.resolved, card: { target, title: TOOLS[tool]?.display ?? label, fields: check.fields } };
  return { entry, ...(check.warnings.length ? { unclear: `${label}: ${check.warnings.join(" ")}` } : {}) };
}

/**
 * Reads each tab answer the way Chat reads a message with that tab's chip: one model call,
 * limited to the tab's tools, then the same checks. Nothing is written; ready entries go on
 * the card, and anything that needs more (a missing amount, which meal?) says so instead.
 */
export async function readTabAnswers(answers: EodAnswer[], ctxFor: (text: string) => Promise<Ctx | null>): Promise<{ entries: TabEntry[]; unclear: string[] }> {
  const entries: TabEntry[] = [];
  const unclear: string[] = [];
  for (const a of answers) {
    const text = a.text.trim();
    if (!isToolTarget(a.target) || !text || isSkip(text)) continue;
    const label = targetLabel(a.target);
    const allowed = toolsFor(a.target);
    const ctx = await ctxFor(text);
    const calls = ctx ? await callModel({ ...ctx, tab: a.target === "reminders" ? undefined : (a.target as ChatTab) }, allowed) : null;
    const usable = settleApplications(calls ?? [], text).filter((c) => c.name !== "no_match" && TOOLS[c.name]?.check);
    if (!ctx || !usable.length) {
      unclear.push(`${label}: couldn't read "${text}". Log it in Chat with the ${label} chip.`);
      continue;
    }
    for (const c of usable) {
      const out = fromCheck(a.target, c.name, await TOOLS[c.name].check!(c.input, ctx));
      if (out.entry) entries.push(out.entry);
      if (out.unclear) unclear.push(out.unclear);
    }
  }
  return { entries, unclear };
}
