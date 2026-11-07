// One chat message in, cards out.
//
//   rules first (no model) -> otherwise one model call -> for each proposed tool:
//   code checks -> decide: save | are-you-sure | confirm | fill missing | pick one of three
//
// The model's only output that matters is its tool calls. Its text is discarded.

import Anthropic from "@anthropic-ai/sdk";
import { fmtDay } from "@/lib/date";
import { CHAT_TABS, type TabKey } from "@/lib/tabs";
import { archivedMessage, loadArchived, tabOf } from "./archive";
import { learnedTab, loadPastPicks, suggest } from "./learned";
import { inScope } from "./scope";
import type { CardOption, ChatCard } from "./cards";
import { chainEventStarts, LONG_TERM_NAMED, MODEL_TOOLS, TOOLS, type Check, type Ctx, type Resolved } from "./tools";

export const MODEL = "claude-haiku-5-5";
const MARGIN = 0.15; // the top reading must lead the runner-up by this much to auto-save
// Tools whose every proposal is confirmed before it's saved (they write outside the app).
// With no competing reading, low model confidence would only swap the confirm card for a
// one-option "unsure" card, so the confidence bar is skipped for them.
const ALWAYS_CONFIRMED = new Set(["add_event"]);

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

// Words that name a tracker outright. Used to settle the tool choice, never to fill fields.
const NAMED: Record<string, RegExp> = {
  log_leetcode: /\b(leet\s?code|neet\s?code|lc)\b/i,
  // The verb settles which application tool (settleApplications enforces it).
  plan_application: /\bapply\b/i,
  add_application: /\bapplied\b/i,
  add_subscription: /\bsubscri(?:be|bed|bing|ption)s?\b/i,
  cancel_subscription: /\b(?:cancel(?:l?ed)?|unsubscribed)\b/i,
  log_spending: /\b(?:spent|spend|paid|bought)\b|\$\s?\d/i,
  add_long_term_reminder: LONG_TERM_NAMED,
};
const BARE_LEETCODE = /^\s*(?:leet\s?code|lc)(?:\s+problem)?\s*[.!]?\s*$/i;

// "personal journal" is listed before "journal" so it wins.
const NOTE_PREFIX = /^\s*(content ideas?|content|work journal|personal journal|personal|diary|add to talos|talos improvements?|talos idea|talos|journal)\s*[:\-–—]/i;
const noteKind = (label: string) =>
  /^(personal|diary)/i.test(label) ? "personal" : /talos/i.test(label) ? "talos" : /journal/i.test(label) ? "journal" : "content";

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

  // Just "leetcode" / "leetcode problem": ask for the problem's name.
  if (BARE_LEETCODE.test(t)) return [{ name: "log_leetcode", input: { title: null, confidence: 1 } }];

  // "content idea: ..." / "journal: ..."
  const n = t.match(NOTE_PREFIX);
  if (n) return [{ name: "add_note", input: { kind: noteKind(n[1]), text: null, confidence: 1 } }];

  return null;
}

// ---- Apply vs applied: settled by the owner's verb, not the model ---------------------
//
// "apply to Ramp" / "need to apply to Ramp" / "remind me to apply to Ramp" = plan_application
// (the "To apply" list). "applied to Ramp" = add_application. Code corrects the model's pick.

type Tense = "plan" | "done";
const VERB = /\b(apply|applied)\b/gi;
const tenseOf = (verb: string): Tense => (verb.toLowerCase() === "applied" ? "done" : "plan");

/** The verb nearest before the company decides; without one, the message's only verb kind does. */
export function applyTense(text: string, company?: unknown): Tense | null {
  const verbs = [...text.matchAll(VERB)];
  if (!verbs.length) return null;
  const at = typeof company === "string" && company.trim() ? text.toLowerCase().indexOf(company.trim().toLowerCase()) : -1;
  const before = at >= 0 ? verbs.filter((v) => v.index! < at) : [];
  if (before.length) return tenseOf(before[before.length - 1][1]);
  const kinds = new Set(verbs.map((v) => tenseOf(v[1])));
  return kinds.size === 1 ? [...kinds][0] : null;
}

// "apply for SWE at Ramp", "apply to Ramp for/as SWE", "apply to Ramp". Trailing "later",
// "tomorrow", "by Friday" etc. aren't part of either name.
const TRAILING = /[\s,]+(?:later|soon|today|tonight|tomorrow|this week|next week|by .+)\s*[.!]?\s*$/i;
export function postingFrom(text: string): { company: string; position: string | null } | null {
  const t = text.replace(TRAILING, "").replace(/[.!]+\s*$/, "").trim();
  const forAt = t.match(/\bapply\s+for\s+(?:the\s+|an?\s+)?(.+?)\s+(?:role\s+|position\s+|job\s+)?at\s+(.+)$/i);
  if (forAt) return { company: forAt[2].trim(), position: forAt[1].trim() };
  const toFor = t.match(/\bapply\s+(?:to|at|with)\s+(.+?)(?:\s+(?:for|as)\s+(?:the\s+|an?\s+)?(.+))?$/i);
  return toFor ? { company: toFor[1].trim(), position: toFor[2]?.trim() || null } : null;
}

/** Rewrites one proposed call to the tool the verb says; anything else passes through. */
function retense(name: string, input: Record<string, unknown>, text: string): Call {
  const confidence = input.confidence;
  if (name === "add_application" && applyTense(text, input.company) === "plan") {
    return { name: "plan_application", input: { company: input.company, position: input.position ?? null, confidence } };
  }
  if (name === "plan_application" && applyTense(text, input.company) === "done") {
    return {
      name: "add_application",
      input: { company: input.company, position: input.position ?? null, applied_days_ago: null, status: null, resume_name: null, confidence },
    };
  }
  // "add a long term reminder to ..." is always long-term, whatever the model picked.
  if (name === "add_reminder" && LONG_TERM_NAMED.test(text)) {
    return { name: "add_long_term_reminder", input: { text: input.text ?? null, show_text: null, due_text: input.due_text ?? null, confidence } };
  }
  // "remind me to apply to Ramp" is a posting to apply to, not a general reminder.
  if (name === "add_reminder") {
    const body = typeof input.text === "string" ? input.text : text;
    const posting = /\bapply\b/i.test(body) && !/\bapplied\b/i.test(body) ? postingFrom(body) : null;
    if (posting) return { name: "plan_application", input: { ...posting, confidence } };
  }
  return { name, input };
}

export function settleApplications(calls: Call[], text: string): Call[] {
  return calls.map((c) => {
    if (c.name !== "no_match") return retense(c.name, c.input, text);
    // The "Where does this go?" options follow the same rule.
    const list = Array.isArray(c.input.candidates) ? (c.input.candidates as { tool?: string; args_json?: string }[]) : [];
    const candidates = list.map((cand) => {
      try {
        const args = JSON.parse(cand.args_json ?? "{}");
        const r = retense(cand.tool ?? "", args, text);
        return { ...cand, tool: r.name, args_json: JSON.stringify(r.input) };
      } catch {
        return cand;
      }
    });
    return { ...c, input: { ...c.input, candidates } };
  });
}

// ---- Model -----------------------------------------------------------------------------

const SYSTEM = `You file short messages from the owner of a personal tracking app. Each message is something they did or want saved: a weigh-in, food, a run, a LeetCode problem, a job application, a reminder, a subscription started or cancelled, money spent, a content idea, a work journal entry, a personal journal entry or an idea for improving this app (Talos).

Job applications go by the owner's verb: "apply to X" (want to, need to, remind me to, apply later) is plan_application, the list of postings to apply to; "applied to X" is add_application, an application already sent. Neither is add_reminder.

"Add a long term reminder to X" (any message saying "long term reminder") is add_long_term_reminder, never add_reminder: put when it should start showing in show_text and the deadline in due_text, as written.

Call one tool per distinct item in the message; a message can hold several. A saved meal with changes is one item: what was left out and what came with it go in that log_saved_meal call, not separate calls. Foods and saved meals are matched against the owner's lists in the context; copy names the way the owner wrote them. Copy only what the owner actually wrote. Never estimate, calculate, convert units or fill in defaults: if a field wasn't said, leave it null. Dates are handled by code; only set days_ago when the owner names another day.

Money spent with an amount ("$14 chipotle", "uber 18.40") is log_spending. If what they paid for is food or drink they had, also call log_food for the food (a priced meal is both); a non-food purchase is log_spending only.

If nothing fits, or you would be guessing, call no_match with your best readings. Always respond with tool calls only.`;

/** Records the call's token counts for Settings > API usage. Never fails the chat. */
export async function logUsage(ctx: Pick<Ctx, "db">, res: Anthropic.Message) {
  try {
    const u = res.usage;
    const { error } = await ctx.db.from("api_usage").insert({
      model: res.model ?? MODEL,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    });
    if (error) console.error(`[agent] usage not logged: ${error.message}`);
  } catch (e) {
    console.error(`[agent] usage not logged: ${String((e as Error).message ?? e).slice(0, 200)}`);
  }
}

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 }));

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
      // A tab chip narrows the tools to that tab's (plus no_match); otherwise all of them.
      tools: ctx.tab ? MODEL_TOOLS.filter((t) => t.name === "no_match" || inScope(ctx.tab, t.name)) : MODEL_TOOLS,
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: `<context>\nToday: ${ctx.today} (${fmtDay(ctx.today)})${ctx.clock ? `\nNow: ${ctx.clock}` : ""}\nSaved meals:\n${meals}\nFoods:\n${foods}${
            ctx.tab ? `\nTab: the owner filed this message under ${CHAT_TABS.find((t) => t.key === ctx.tab)!.label}.` : ""
          }\n</context>\n\n<message>\n${ctx.text}\n</message>`,
        },
      ],
    });
    await logUsage(ctx, res);
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
  const tab = (r: Resolved) => tabOf(name, r) ?? undefined;
  if (check.status === "ready") return [{ tool: display, fields: check.fields, proposalId: await propose(name, check.resolved, true), tab: tab(check.resolved) }];
  if (check.status === "ambiguous")
    return Promise.all(check.options.map(async (o) => ({ tool: display, fields: o.fields, proposalId: await propose(name, o.resolved, true), tab: tab(o.resolved) })));
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
      const tab = tabOf(cand.tool!, args);
      if (tab && ctx.archived?.has(tab)) continue; // never offered while archived
      if (!inScope(ctx.tab, cand.tool!)) continue; // a tab chip keeps it to that tab
      out.push({ name: cand.tool!, confidence: cand.confidence ?? 0, check: await tool.check(args, ctx) });
    }
  }
  return out;
}

export async function decide(rawCalls: Call[], ctx: Ctx, threshold: number, propose: Propose): Promise<ChatCard[]> {
  const calls = chainEventStarts(rawCalls);
  const alts = await candidates(calls, ctx);
  const runnerUp = Math.max(0, ...alts.map((a) => a.confidence));
  const writes = calls.filter((c) => c.name !== "no_match" && TOOLS[c.name]?.check);
  const cards: ChatCard[] = [];
  const saved: { name: string; resolved: Resolved }[] = [];

  for (const call of writes) {
    const tool = TOOLS[call.name];
    const tab = tabOf(call.name, call.input);
    if (tab && ctx.archived?.has(tab)) {
      cards.push({ kind: "failed", detail: archivedMessage(tab) });
      continue;
    }
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
    // The owner named the tracker ("leetcode ...") or picked its chip: which tool is settled,
    // so model confidence and the runner-up margin don't apply. Fields were still checked above.
    const named = (ctx.tab != null && inScope(ctx.tab, call.name)) || NAMED[call.name]?.test(ctx.text) === true;
    const conf = confOf(call.input);
    const settled = ALWAYS_CONFIRMED.has(call.name) && alts.length === 0;
    if (!named && !settled && (conf < threshold || conf - runnerUp < MARGIN)) {
      const options = [...(await optionsFrom(call.name, check, propose))];
      for (const a of alts) if (options.length < 3) options.push(...(await optionsFrom(a.name, a.check, propose)));
      cards.push({ kind: "unsure", options: options.slice(0, 3) });
      continue;
    }
    if (check.warnings.length) {
      cards.push({
        kind: "warning", detail: check.warnings.join(" "), proposalId: await propose(call.name, check.resolved), text: ctx.text,
        ...(tool.confirm ? { title: tool.confirm.title, action: tool.confirm.action } : {}),
      });
      continue;
    }
    const out = await commitCard(call.name, check.resolved, ctx, propose, { left: false });
    if (out[0]?.kind === "saved") saved.push({ name: call.name, resolved: check.resolved });
    cards.push(...out);
  }

  // One "left today" after all the message's food is in, per day logged to.
  for (const date of foodDates(saved)) {
    const left = await leftCard(ctx.db, date);
    if (left) cards.push(left);
  }

  if (!writes.length) {
    const options: CardOption[] = [];
    for (const a of alts.sort((x, y) => y.confidence - x.confidence)) if (options.length < 3) options.push(...(await optionsFrom(a.name, a.check, propose)));
    cards.push(options.length ? { kind: "unsure", options: options.slice(0, 3) } : { kind: "failed", detail: "Couldn't tell where this goes." });
  }
  // Put what the owner chose for a message like this before first. A tab chip already settled it.
  if (ctx.tab || !cards.some((c) => c.kind === "unsure" && !c.title)) return cards;
  return suggest(cards, learnedTab(ctx.text, await loadPastPicks(ctx.db), ctx.archived ?? new Set()));
}

// Tools that log food: after they save, chat says what's left of that day's calories and protein.
const FOOD_TOOLS = new Set(["log_food", "log_saved_meal"]);

/**
 * That day's calories and protein against its targets, after everything just logged.
 * Null if either can't be read: the food is saved either way, so nothing fails over it.
 */
export async function leftCard(db: Ctx["db"], date: string): Promise<ChatCard | null> {
  try {
    const [day, targets] = await Promise.all([
      db.from("daily_totals").select("calories, protein_g").eq("logical_date", date).maybeSingle(),
      db.rpc("targets_for", { p_date: date }),
    ]);
    if (day.error || targets.error) return null;
    const t = (Array.isArray(targets.data) ? targets.data[0] : targets.data) as { calorie_target?: unknown; protein_target_g?: unknown } | null;
    const calTarget = Number(t?.calorie_target), proteinTarget = Number(t?.protein_target_g);
    if (!Number.isFinite(calTarget) || !Number.isFinite(proteinTarget)) return null;
    return {
      kind: "left", date, calTarget, proteinTarget,
      cal: Number(day.data?.calories ?? 0), protein: Number(day.data?.protein_g ?? 0),
    };
  } catch {
    return null;
  }
}

/** The food tools' saved dates in `cards`' order of tools, once each. */
const foodDates = (saved: { name: string; resolved: Resolved }[]) =>
  [...new Set(saved.filter((s) => FOOD_TOOLS.has(s.name) && typeof s.resolved.date === "string").map((s) => s.resolved.date as string))];

/**
 * Commits a checked proposal and turns the result into cards (a save can carry a follow-up offer).
 * A food save ends with what's left for the day, unless `left: false` (decide() adds one for the
 * whole message instead, so three foods in one message get one summary).
 */
export async function commitCard(
  name: string, resolved: Resolved, ctx: Pick<Ctx, "db" | "archived">, propose: Propose, opts: { left?: boolean } = {},
): Promise<ChatCard[]> {
  const cards = await commitCards(name, resolved, ctx, propose);
  if (opts.left !== false && cards[0]?.kind === "saved") {
    for (const date of foodDates([{ name, resolved }])) {
      const left = await leftCard(ctx.db, date);
      if (left) cards.push(left);
    }
  }
  return cards;
}

async function commitCards(name: string, resolved: Resolved, ctx: Pick<Ctx, "db" | "archived">, propose: Propose): Promise<ChatCard[]> {
  const tool = TOOLS[name];
  if (!tool) return [{ kind: "failed" }];
  // Every chat write (and every confirm) passes through here: an archived tab is refused
  // even for a proposal made before it was archived.
  const archived = ctx.archived ?? (await loadArchived(ctx.db));
  const tab = tabOf(name, resolved);
  if (tab && archived.has(tab)) return [{ kind: "failed", detail: archivedMessage(tab) }];
  const out = await tool.commit(resolved, ctx.db);
  if (out.status === "confirm") return [{ kind: "confirm", title: out.title, changes: out.changes, proposalId: await propose(out.tool, out.resolved) }];
  if (out.status === "failed") return [{ kind: "failed", detail: out.detail }];
  const cards: ChatCard[] = [{ kind: "saved", label: out.label, actionId: out.actionId, ...(out.googleEvent ? { googleEvent: out.googleEvent } : {}) }];
  for (const extra of out.also ?? []) cards.push({ kind: "saved", label: extra.label, actionId: extra.actionId });
  const offerTab = out.offer ? tabOf(out.offer.tool, out.offer.resolved) : null;
  if (out.offer && !(offerTab && archived.has(offerTab))) {
    cards.push({ kind: "missing", title: out.offer.title, missing: out.offer.missing, proposalId: await propose(out.offer.tool, out.offer.resolved) });
  }
  return cards;
}

export async function run(ctx: Ctx, threshold: number, propose: Propose): Promise<RunResult> {
  if (ctx.tab) {
    if (ctx.archived?.has(ctx.tab)) return { route: "rule", calls: [], cards: [{ kind: "failed", detail: archivedMessage(ctx.tab as TabKey) }] };
    // Content / Work Journal / Personal Journal chip: the whole message is the note, saved as typed. No model.
    if (ctx.tab === "content" || ctx.tab === "journal" || ctx.tab === "personal" || ctx.tab === "talos") {
      const calls: Call[] = [{ name: "add_note", input: { kind: ctx.tab, text: null, confidence: 1 } }];
      return { route: "rule", calls, cards: await decide(calls, ctx, threshold, propose) };
    }
  }
  const ruled = preRoute(ctx);
  // A rule match outside the chosen tab ("168" under Runs) goes to the model instead.
  if (ruled && ruled.every((c) => inScope(ctx.tab, c.name))) return { route: "rule", calls: ruled, cards: await decide(ruled, ctx, threshold, propose) };
  const raw = await callModel(ctx);
  if (!raw) return { route: "model", calls: [], cards: [{ kind: "failed" }] };
  const calls = settleApplications(raw, ctx.text).filter((c) => inScope(ctx.tab, c.name));
  return { route: "model", calls, cards: await decide(calls, ctx, threshold, propose) };
}

