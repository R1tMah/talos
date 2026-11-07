// End of day: turning the owner's answers into entries for the EOD card.
//
// Journal and note answers from the interview are saved exactly as typed; the model
// is never asked about them. The model is used only to find purchases in a spending
// answer, or to split a one-shot "EOD: ..." message into its parts. Whatever it
// returns is checked like every other chat write: text has to be the owner's own
// words, and an amount has to be a number they typed.

import type Anthropic from "@anthropic-ai/sdk";
import { isSpendCategory, SPEND_CATEGORIES } from "@/lib/spending";
import { isSkip, type EodAnswer, type EodDraft, type EodNoteKind, type EodSpend, type EodTarget } from "@/lib/eod";
import { anthropic, logUsage, MODEL } from "./run";
import { typed, verbatim, type Db } from "./tools";

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
 * The card's entries from interview answers. Notes are the owner's answer as typed;
 * spending is what the model found in the spending answers, checked against them.
 */
export function draftFromAnswers(answers: EodAnswer[], ex: Extraction | null): EodDraft {
  const draft: EodDraft = { notes: [], spending: [], unclear: [] };
  for (const a of answers) {
    const text = a.text.trim();
    if (!text || isSkip(text) || a.target === "spending") continue;
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
  const draft: EodDraft = { notes: [], spending: [], unclear: [] };
  for (const [kind, field] of Object.entries(FIELD) as [EodNoteKind, keyof Omit<Extraction, "spending">][]) {
    if (!allowed.has(kind)) continue;
    const body = verbatim(ex?.[field], text);
    if (body?.trim()) draft.notes.push({ kind, body: body.trim() });
  }
  if (allowed.has("spending")) draft.spending = spendingFrom(ex, text);
  if (!draft.notes.length && !draft.spending.length) draft.unclear.push(`Couldn't sort "${text}" into entries.`);
  return draft;
}
