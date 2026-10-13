// One chat message in, cards out.
//
//   rules first (no model) -> otherwise one model call -> for each proposed tool:
//   code checks -> decide: save | are-you-sure | confirm | fill missing | pick one of three
//
// The model's only output that matters is its tool calls. Its text is discarded.

import Anthropic from "@anthropic-ai/sdk";
import { fmtDay } from "@/lib/date";
import type { CardOption, ChatCard } from "./cards";
import { MODEL_TOOLS, TOOLS, type Check, type Ctx, type Resolved } from "./tools";

export const MODEL = "claude-haiku-5-5";
const MARGIN = 0.15; // the top reading must lead the runner-up by this much to auto-save

export interface Call {
  name: string;
  input: Record<string, unknown>;
}

export interface RunResult {
  cards: ChatCard[];
  route: "rule" | "model";
  calls: Call[];
}

// ---- Rules: deterministic routing that skips the model ------------------------------

const NOTE_PREFIX = /^\s*(content ideas?|content|work journal|journal)\s*[:\-–—]/i;

export function preRoute(ctx: Ctx): Call[] | null {
  const t = ctx.text.trim();

  // A bare number in weight range: "168.4", "169 lb".
  const w = t.match(/^(\d{2,3}(?:\.\d)?)\s*(?:lbs?|pounds)?$/i);
  if (w && Number(w[1]) >= 90 && Number(w[1]) <= 400) {
    return [{ name: "log_weight", input: { weight_lb: Number(w[1]), days_ago: null, note: null, confidence: 1 } }];
  }

  // Exactly a saved meal's name or alias, optionally after "had" / "had my" / "ate".
  const said = t.toLowerCase().replace(/^(?:had|ate)\s+(?:my\s+|a\s+|the\s+)?/, "").replace(/\s+/g, " ").trim();
  const meal = ctx.meals.find((m) => [m.name, ...m.aliases].some((n) => n.toLowerCase().replace(/\s+/g, " ").trim() === said));
  if (meal) return [{ name: "log_saved_meal", input: { meal: meal.name, portions: null, days_ago: null, confidence: 1 } }];

  // "content idea: ..." / "journal: ..."
  const n = t.match(NOTE_PREFIX);
  if (n) return [{ name: "add_note", input: { kind: /journal/i.test(n[1]) ? "journal" : "content", text: null, confidence: 1 } }];

  return null;
}

// ---- Model -----------------------------------------------------------------------------

const SYSTEM = `You file short messages from the owner of a personal tracking app. Each message is something they did or want saved: a weigh-in, food, a LeetCode problem, a content idea or a journal entry.

Call one tool per distinct item in the message; a message can hold several. A saved meal with changes is one item: what was left out and what came with it go in that log_saved_meal call, not separate calls. Foods and saved meals are matched against the owner's lists in the context; copy names the way the owner wrote them. Copy only what the owner actually wrote. Never estimate, calculate, convert units or fill in defaults: if a field wasn't said, leave it null. Dates are handled by code; only set days_ago when the owner names another day.

If nothing fits, or you would be guessing, call no_match with your best readings. Always respond with tool calls only.`;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 }));

export async function callModel(ctx: Ctx): Promise<Call[] | null> {
  const foodName = new Map(ctx.foods.map((f) => [f.id, f.name]));
  const meals = ctx.meals.length
    ? ctx.meals
        .map((m) => {
          const aliases = m.aliases.length ? `; aliases: ${m.aliases.join(", ")}` : "";
          const items = m.items.length
            ? `; ingredients: ${m.items.map((i) => `${i.servings === 1 ? "" : `${i.servings}× `}${foodName.get(i.foodId) ?? "?"}`).join(", ")}`
            : "";
          return `- ${m.name} (per ${m.unit})${aliases}${items}`;
        })
        .join("\n")
    : "(none)";
  const foods = ctx.foods.length
    ? ctx.foods.map((f) => `- ${f.name} (per ${f.unit})${f.aliases.length ? `; aliases: ${f.aliases.join(", ")}` : ""}`).join("\n")
    : "(none)";
  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: MODEL_TOOLS,
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: `<context>\nToday: ${ctx.today} (${fmtDay(ctx.today)})\nSaved meals:\n${meals}\nFoods:\n${foods}\n</context>\n\n<message>\n${ctx.text}\n</message>`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.error(`[agent] model stopped: ${res.stop_reason}`);
      return null;
    }
    return res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
  } catch (e) {
    // Status and message only; never the request (it holds the owner's text) or the key.
    const err = e as { status?: number; message?: string };
    console.error(`[agent] model call failed: ${err.status ?? ""} ${String(err.message ?? e).slice(0, 300)}`);
    return null;
  }
}

// ---- Decide ------------------------------------------------------------------------------

/** Stores a write waiting on the owner and returns its id. */
export type Propose = (tool: string, resolved: Resolved, option?: boolean) => Promise<string>;

const confOf = (input: Record<string, unknown>) => (typeof input.confidence === "number" ? input.confidence : 0);

async function optionsFrom(name: string, check: Check, propose: Propose): Promise<CardOption[]> {
  const display = TOOLS[name]?.display ?? name;
  if (check.status === "ready") return [{ tool: display, fields: check.fields, proposalId: await propose(name, check.resolved, true) }];
  if (check.status === "ambiguous")
    return Promise.all(check.options.map(async (o) => ({ tool: display, fields: o.fields, proposalId: await propose(name, o.resolved, true) })));
  return [];
}

/** no_match candidates, checked like any other proposal. Unusable ones are dropped. */
async function candidates(calls: Call[], ctx: Ctx) {
  const out: { name: string; confidence: number; check: Check }[] = [];
  for (const c of calls.filter((c) => c.name === "no_match")) {
    const list = Array.isArray(c.input.candidates) ? c.input.candidates : [];
    for (const cand of list.slice(0, 3) as { tool?: string; args_json?: string; confidence?: number }[]) {
      const tool = cand.tool ? TOOLS[cand.tool] : undefined;
      if (!tool?.check) continue;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(cand.args_json ?? "{}");
      } catch {
        continue;
      }
      out.push({ name: cand.tool!, confidence: cand.confidence ?? 0, check: await tool.check(args, ctx) });
    }
  }
  return out;
}

export async function decide(calls: Call[], ctx: Ctx, threshold: number, propose: Propose): Promise<ChatCard[]> {
  const alts = await candidates(calls, ctx);
  const runnerUp = Math.max(0, ...alts.map((a) => a.confidence));
  const writes = calls.filter((c) => c.name !== "no_match" && TOOLS[c.name]?.check);
  const cards: ChatCard[] = [];

  for (const call of writes) {
    const tool = TOOLS[call.name];
    const check = await tool.check!(call.input, ctx);

    if (check.status === "invalid") {
      cards.push({ kind: "failed", detail: check.detail });
      continue;
    }
    if (check.status === "missing") {
      cards.push({ kind: "missing", title: check.title, missing: check.missing, proposalId: await propose(call.name, check.resolved) });
      continue;
    }
    if (check.status === "ambiguous") {
      cards.push({ kind: "unsure", title: check.title, options: await optionsFrom(call.name, check, propose) });
      continue;
    }

    // Model confidence alone is poorly calibrated; it also has to clearly lead the alternatives.
    const conf = confOf(call.input);
    if (conf < threshold || conf - runnerUp < MARGIN) {
      const options = [...(await optionsFrom(call.name, check, propose))];
      for (const a of alts) if (options.length < 3) options.push(...(await optionsFrom(a.name, a.check, propose)));
      cards.push({ kind: "unsure", options: options.slice(0, 3) });
      continue;
    }
    if (check.warnings.length) {
      cards.push({ kind: "warning", detail: check.warnings.join(" "), proposalId: await propose(call.name, check.resolved), text: ctx.text });
      continue;
    }
    cards.push(...(await commitCard(call.name, check.resolved, ctx, propose)));
  }

  if (!writes.length) {
    const options: CardOption[] = [];
    for (const a of alts.sort((x, y) => y.confidence - x.confidence)) if (options.length < 3) options.push(...(await optionsFrom(a.name, a.check, propose)));
    cards.push(options.length ? { kind: "unsure", options: options.slice(0, 3) } : { kind: "failed", detail: "Couldn't tell where this goes." });
  }
  return cards;
}

/** Commits a checked proposal and turns the result into cards (a save can carry a follow-up offer). */
export async function commitCard(name: string, resolved: Resolved, ctx: Pick<Ctx, "db">, propose: Propose): Promise<ChatCard[]> {
  const tool = TOOLS[name];
  if (!tool) return [{ kind: "failed" }];
  const out = await tool.commit(resolved, ctx.db);
  if (out.status === "confirm") return [{ kind: "confirm", title: out.title, changes: out.changes, proposalId: await propose(out.tool, out.resolved) }];
  if (out.status === "failed") return [{ kind: "failed", detail: out.detail }];
  const cards: ChatCard[] = [{ kind: "saved", label: out.label, actionId: out.actionId }];
  for (const extra of out.also ?? []) cards.push({ kind: "saved", label: extra.label, actionId: extra.actionId });
  if (out.offer) {
    cards.push({ kind: "missing", title: out.offer.title, missing: out.offer.missing, proposalId: await propose(out.offer.tool, out.offer.resolved) });
  }
  return cards;
}

export async function run(ctx: Ctx, threshold: number, propose: Propose): Promise<RunResult> {
  const ruled = preRoute(ctx);
  if (ruled) return { route: "rule", calls: ruled, cards: await decide(ruled, ctx, threshold, propose) };
  const calls = await callModel(ctx);
  if (!calls) return { route: "model", calls: [], cards: [{ kind: "failed" }] };
  return { route: "model", calls, cards: await decide(calls, ctx, threshold, propose) };
}

