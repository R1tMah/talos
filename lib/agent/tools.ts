// The tool registry: one entry per tool, defining what the model sees, the checks
// code runs on what it proposes, and how a checked proposal is committed.
//
// The model only picks a tool and copies what the owner wrote. Everything here is
// code: name resolution against the database, range checks, verbatim guards, the
// write (through the same database functions the tabs use), and the card text.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { addDays, fmtDay } from "@/lib/date";
import type { Change } from "@/lib/types";
import { foodWarnings, leetcodeWarnings, portionWarnings, weightWarnings } from "@/lib/validate";
import type { MissingField } from "./cards";
import { closest, nameScore } from "./fuzzy";

export type Db = SupabaseClient<Database>;

export interface SavedMeal {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
}

export interface Ctx {
  db: Db;
  text: string; // the owner's message, exactly as sent
  today: string; // logical date in the owner's timezone
  meals: SavedMeal[];
}

/** Arguments after code checks: everything a commit needs. Stored in pending_proposals. */
export type Resolved = { [key: string]: Json };
type Input = Record<string, unknown>;

export type Check =
  | { status: "ready"; resolved: Resolved; fields: [string, string][]; warnings: string[] }
  | { status: "missing"; resolved: Resolved; title: string; missing: MissingField[] }
  | { status: "ambiguous"; options: { resolved: Resolved; fields: [string, string][] }[]; title?: string }
  | { status: "invalid"; detail: string };

export type Commit =
  | {
      status: "saved";
      label: string;
      actionId: string | null;
      /** A follow-up the owner can take, shown as its own card (e.g. add the missing application). */
      offer?: { tool: string; resolved: Resolved; title: string; missing: MissingField[] };
      /** Further writes made by the same commit, each shown as its own saved card with its own Undo. */
      also?: { label: string; actionId: string | null }[];
    }
  | { status: "confirm"; title: string; changes: Change[]; tool: string; resolved: Resolved }
  | { status: "failed"; detail?: string };

export interface ToolDef {
  name: string;
  display: string; // shown on option chips
  /** Omitted for internal tools that only exist as proposals (e.g. update_weight). */
  definition?: Anthropic.Tool;
  check?(input: Input, ctx: Ctx): Promise<Check>;
  commit(r: Resolved, db: Db): Promise<Commit>;
  /** Merges values from a missing-fields card. Returns a message when they're not usable. */
  fill?(r: Resolved, values: Input): Resolved | string;
}

// ---- Helpers ---------------------------------------------------------------------

const daysAgo = { type: ["integer", "null"], description: "Only when the owner names another day: yesterday = 1, two days ago = 2. Otherwise null." };
const confidence = { type: "number", description: "0 to 1: how sure you are this message belongs to this tool with these fields." };

function dateFor(input: Input, today: string) {
  const n = input.days_ago;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 60 ? addDays(today, -n) : today;
}

/** The owner's own words for `s`, or null if they don't appear in the message. */
function verbatim(s: unknown, text: string): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const i = text.toLowerCase().indexOf(s.toLowerCase());
  return i >= 0 ? text.slice(i, i + s.length) : null;
}

/** True when `n` is literally one of the numbers the owner typed. */
function typed(n: unknown, text: string): n is number {
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).some((t) => Number(t) === n);
}

/** "28:14" -> 28.23, "1h 13m" -> 73, "20 minutes" -> 20. Null when unreadable. */
function parseMinutes(t: string | null): number | null {
  if (!t) return null;
  let m = t.match(/(\d+)\s*h(?:ours?|rs?)?\b\s*(?:(\d+)\s*m)?/i);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = t.match(/(\d+):(\d{2})/);
  if (m) return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?)?\b/i);
  return m ? Number(m[1]) : null;
}

type RpcOut = { status?: string; row?: Record<string, unknown>; action_id?: string | null; existing?: Record<string, unknown> };

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<RpcOut | null> {
  // Function names and args come from this file only; the generated types can't
  // express a dynamic name, so the call is typed loosely here.
  const { data, error } = await (db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(fn, args);
  return error ? null : (data as RpcOut);
}

const num = (v: unknown) => Number(v);
const g = (v: unknown) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(1));

// ---- Tools -----------------------------------------------------------------------

const logWeight: ToolDef = {
  name: "log_weight",
  display: "Weight",
  definition: {
    name: "log_weight",
    description:
      "The owner's body weight in pounds from a weigh-in, e.g. 'weighed in at 169', '168.4 this morning'. " +
      "Not for lifting weights or sets ('bench 155'), and not for food.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["weight_lb", "days_ago", "note", "confidence"],
      properties: {
        weight_lb: { type: "number", description: "The number the owner wrote, unchanged." },
        days_ago: daysAgo,
        note: { type: ["string", "null"], description: "Remark the owner added about this weigh-in, copied exactly from the message. Null if none." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    if (!typed(input.weight_lb, ctx.text)) return { status: "invalid", detail: "No weight found in the message." };
    const lb = input.weight_lb as number;
    const date = dateFor(input, ctx.today);
    const note = verbatim(input.note, ctx.text);
    const prev = await ctx.db.from("weights").select("weight_lb").is("deleted_at", null).lt("logical_date", date)
      .order("logical_date", { ascending: false }).limit(1);
    const previous = prev.data?.[0] ? Number(prev.data[0].weight_lb) : null;
    const fields: [string, string][] = [["Weight", `${lb} lb`], ["Date", fmtDay(date)]];
    if (note) fields.push(["Note", note]);
    return { status: "ready", resolved: { date, weight_lb: lb, note }, fields, warnings: weightWarnings(lb, previous) };
  },
  async commit(r, db) {
    const out = await rpc(db, "save_weight", { p_date: r.date, p_weight_lb: r.weight_lb, p_note: r.note, p_tool: "log_weight" });
    if (!out) return { status: "failed" };
    if (out.status === "conflict" && out.existing) {
      const e = out.existing;
      return {
        status: "confirm",
        title: `Update ${fmtDay(String(r.date))} weight?`,
        changes: [{ field: "Weight", from: `${g(e.weight_lb)} lb`, to: `${g(r.weight_lb)} lb` }],
        tool: "update_weight",
        resolved: { id: String(e.id), date: r.date, weight_lb: r.weight_lb, note: r.note ?? (e.note as string | null) ?? null },
      };
    }
    const row = out.row!;
    return { status: "saved", label: `Weight ${num(row.weight_lb).toFixed(1)} lb, ${fmtDay(String(row.logical_date))}`, actionId: out.action_id ?? null };
  },
};

/** Only reachable from a confirm card ("Update today's weight?"). */
const updateWeight: ToolDef = {
  name: "update_weight",
  display: "Weight",
  async commit(r, db) {
    const out = await rpc(db, "update_weight", { p_id: r.id, p_date: r.date, p_weight_lb: r.weight_lb, p_note: r.note, p_tool: "log_weight" });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    return { status: "saved", label: `Weight ${num(out.row.weight_lb).toFixed(1)} lb, ${fmtDay(String(out.row.logical_date))}`, actionId: out.action_id ?? null };
  },
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const logSavedMeal: ToolDef = {
  name: "log_saved_meal",
  display: "Saved meal",
  definition: {
    name: "log_saved_meal",
    description:
      "One of the owner's saved meals, named in the message (see the saved meals list). Use only when the owner names " +
      "a saved meal or one of its aliases; a generic word like 'breakfast' or 'lunch' alone is not a saved meal. " +
      "Not for foods that aren't in the list.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["meal", "portions", "days_ago", "confidence"],
      properties: {
        meal: { type: "string", description: "The saved meal name or alias as the owner wrote it." },
        portions: { type: ["number", "null"], description: "How many portions the owner said (e.g. '6 oz' of a per-oz meal is 6, 'half' is 0.5). Null if not said." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const q = norm(String(input.meal ?? ""));
    if (!q) return { status: "invalid", detail: "No saved meal named." };
    const names = (m: SavedMeal) => [m.name, ...m.aliases].map(norm);
    const portions = typeof input.portions === "number" && input.portions > 0 ? input.portions : 1;
    const date = dateFor(input, ctx.today);
    const toOption = (m: SavedMeal, alias: string | null = null) => ({
      resolved: { date, meal_id: m.id, portions, alias } as Resolved,
      fields: [
        ["Meal", m.name], ["Portions", `${portions} ${m.unit}`], ["Date", fmtDay(date)],
        ...(alias ? [["Adds alias", alias] as [string, string]] : []),
      ] as [string, string][],
    });

    const exact = ctx.meals.filter((m) => names(m).includes(q));
    if (exact.length === 1) return { status: "ready", ...toOption(exact[0]), warnings: portionWarnings(portions) };
    if (exact.length > 1) return { status: "ambiguous", title: "Did you mean…", options: exact.slice(0, 3).map((m) => toOption(m)) };

    // Not an exact name: suggest the closest meals ("did you mean"), never log on a guess.
    // Picking one also saves what the owner typed as an alias, so next time it's exact.
    const said = verbatim(input.meal, ctx.text)?.trim().toLowerCase() ?? null;
    const partial = ctx.meals.filter((m) => names(m).some((n) => n.length >= 3 && (n.includes(q) || q.includes(n))));
    const fuzzy = closest(q, ctx.meals, (m) => [m.name, ...m.aliases]).map((x) => x.item);
    const score = (m: SavedMeal) => Math.max(...[m.name, ...m.aliases].map((n) => nameScore(q, n)));
    const suggestions = [...new Map([...partial, ...fuzzy].map((m) => [m.id, m])).values()]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
    if (!suggestions.length) return { status: "invalid", detail: `No saved meal like "${input.meal}".` };
    return { status: "ambiguous", title: "Did you mean…", options: suggestions.map((m) => toOption(m, said)) };
  },
  async commit(r, db) {
    const out = await rpc(db, "log_saved_meal", { p_date: r.date, p_meal_id: r.meal_id, p_portions: r.portions, p_tool: "log_saved_meal" });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    const saved: Commit = {
      status: "saved",
      label: `${row.description} × ${g(row.amount)} ${row.unit}: ${row.calories} cal, ${g(row.protein_g)} g protein`,
      actionId: out.action_id ?? null,
    };
    // Picked from "did you mean": remember the owner's wording as an alias.
    if (typeof r.alias === "string" && r.alias) {
      const { data: meal } = await db.from("saved_meals").select("*").eq("id", String(r.meal_id)).is("deleted_at", null).single();
      if (meal && ![meal.name, ...meal.aliases].map(norm).includes(norm(r.alias))) {
        const added = await rpc(db, "update_meal", {
          p_id: meal.id, p_name: meal.name, p_aliases: [...meal.aliases, r.alias], p_portion_unit: meal.portion_unit,
          p_calories: meal.calories, p_protein_g: meal.protein_g, p_carbs_g: meal.carbs_g, p_fat_g: meal.fat_g, p_tool: "log_saved_meal",
        });
        if (added?.status === "saved") saved.also = [{ label: `Alias "${r.alias}" for ${meal.name}`, actionId: added.action_id ?? null }];
      }
    }
    return saved;
  },
};

const logFood: ToolDef = {
  name: "log_food",
  display: "Food",
  definition: {
    name: "log_food",
    description:
      "A one-off food the owner ate that is not one of their saved meals, e.g. 'chicken bowl 650 cal 50p'. " +
      "Copy calories and protein only if the owner typed the numbers; never estimate them.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["description", "calories", "protein_g", "days_ago", "confidence"],
      properties: {
        description: { type: "string", description: "Short name of the food, in the owner's words." },
        calories: { type: ["number", "null"], description: "Calories the owner typed. Null if they didn't type a number." },
        protein_g: { type: ["number", "null"], description: "Grams of protein the owner typed. Null if they didn't type a number." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const description = String(input.description ?? "").trim();
    if (!description) return { status: "invalid", detail: "No food named." };
    // Numbers the owner didn't type are treated as missing, never as estimates.
    const calories = typed(input.calories, ctx.text) ? Math.round(input.calories as number) : null;
    const protein = typed(input.protein_g, ctx.text) ? (input.protein_g as number) : null;
    const date = dateFor(input, ctx.today);
    const resolved: Resolved = { date, description, calories, protein_g: protein };
    const missing: MissingField[] = [];
    if (calories == null) missing.push({ name: "calories", label: "Calories" });
    if (protein == null) missing.push({ name: "protein_g", label: "Protein (g)" });
    if (missing.length) return { status: "missing", resolved, title: `Log "${description}"`, missing };
    return {
      status: "ready",
      resolved,
      fields: [["Food", description], ["Calories", String(calories)], ["Protein", `${protein} g`], ["Date", fmtDay(date)]],
      warnings: foodWarnings(calories!, protein!),
    };
  },
  fill(r, values) {
    const out = { ...r };
    for (const k of ["calories", "protein_g"] as const) {
      if (out[k] != null) continue;
      const v = Number(values[k]);
      if (values[k] === "" || values[k] == null || !Number.isFinite(v) || v < 0) return `${k === "calories" ? "Calories" : "Protein"} must be a number.`;
      out[k] = k === "calories" ? Math.round(v) : v;
    }
    return out;
  },
  async commit(r, db) {
    const out = await rpc(db, "log_food", {
      p_date: r.date, p_description: r.description, p_calories: r.calories, p_protein_g: r.protein_g, p_tool: "log_food",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `${row.description}: ${row.calories} cal, ${g(row.protein_g)} g protein`, actionId: out.action_id ?? null };
  },
};

const logLeetcode: ToolDef = {
  name: "log_leetcode",
  display: "LeetCode",
  definition: {
    name: "log_leetcode",
    description:
      "A LeetCode problem the owner attempted, e.g. 'Koko eating bananas 10 minutes', 'did coin change, failed'. " +
      "Leave fields null when the owner didn't say them.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "time_text", "hints", "result", "redo", "notes", "difficulty", "topic", "days_ago", "confidence"],
      properties: {
        title: { type: "string", description: "Problem name as the owner wrote it." },
        time_text: { type: ["string", "null"], description: "The time exactly as written, e.g. '10:00', '25 minutes'. Null if none." },
        hints: { anyOf: [{ type: "string", enum: ["none", "small", "multiple"] }, { type: "null" }], description: "'no hints' = none; one or two small hints = small; a few or more = multiple." },
        result: { anyOf: [{ type: "string", enum: ["optimal", "suboptimal", "failed"] }, { type: "null" }], description: "Only from the owner's words: optimal; unoptimal/not optimal = suboptimal; failed/gave up/looked at the answer = failed." },
        redo: { type: ["boolean", "null"], description: "True only if the owner says to redo it or put it in the redo queue." },
        notes: { type: ["string", "null"], description: "Any remark beyond the facts above, copied exactly from the message. Null if none." },
        difficulty: { anyOf: [{ type: "string", enum: ["easy", "medium", "hard"] }, { type: "null" }], description: "Only used if the problem isn't in the catalog." },
        topic: { type: ["string", "null"], description: "Only used if the problem isn't in the catalog." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const title = String(input.title ?? "").trim();
    if (!title) return { status: "invalid", detail: "No problem named." };
    const timeText = verbatim(input.time_text, ctx.text);
    const minutes = parseMinutes(timeText);
    const date = dateFor(input, ctx.today);
    // Not a strict tool, so enum values are checked here; anything else counts as not said.
    const oneOf = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : null);
    const base = {
      date, minutes,
      hints: oneOf(input.hints, ["none", "small", "multiple"]),
      result: oneOf(input.result, ["optimal", "suboptimal", "failed"]),
      redo: input.redo === true,
      notes: verbatim(input.notes, ctx.text),
      difficulty: oneOf(input.difficulty, ["easy", "medium", "hard"]),
      topic: typeof input.topic === "string" && input.topic.trim() ? input.topic.trim() : null,
    };
    const { data: hits } = await ctx.db.rpc("lc_lookup", { p_title: title });
    const fieldsFor = (t: string, d: string | null): [string, string][] => {
      const f: [string, string][] = [["Problem", t]];
      if (d) f.push(["Level", d]);
      if (minutes != null) f.push(["Minutes", g(minutes)]);
      if (base.result) f.push(["Result", base.result]);
      if (base.hints) f.push(["Hints", base.hints]);
      return f;
    };
    if (hits && hits.length > 1) {
      return { status: "ambiguous", options: hits.slice(0, 3).map((h) => ({ resolved: { ...base, title: h.title }, fields: fieldsFor(h.title, h.difficulty) })) };
    }
    const known = hits?.[0];
    return {
      status: "ready",
      resolved: { ...base, title: known?.title ?? title },
      fields: fieldsFor(known?.title ?? title, known?.difficulty ?? base.difficulty),
      warnings: leetcodeWarnings(minutes),
    };
  },
  async commit(r, db) {
    const out = await rpc(db, "log_leetcode", {
      p_date: r.date, p_title: r.title, p_minutes: r.minutes, p_hints: r.hints, p_result: r.result, p_redo: r.redo,
      p_notes: r.notes, p_difficulty: r.difficulty, p_topic: r.topic, p_inferred: true, p_tool: "log_leetcode",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed", detail: out?.status === "ambiguous" ? "That name matches more than one problem." : undefined };
    const row = out.row;
    const bits = [row.difficulty, row.minutes != null ? `${g(row.minutes)} min` : null, row.result].filter(Boolean);
    return { status: "saved", label: `LeetCode: ${row.title}${bits.length ? ` (${bits.join(", ")})` : ""}`, actionId: out.action_id ?? null };
  },
};

// "content idea: ...", "journal - ..." prefixes. Everything after is saved byte for byte.
const NOTE_PREFIX = /^\s*(?:content ideas?|content|work journal|journal)\s*[:\-–—]?\s*/i;

const addNote: ToolDef = {
  name: "add_note",
  display: "Note",
  definition: {
    name: "add_note",
    description:
      "A content idea or a work journal entry, e.g. 'content idea: day in the life', 'journal: shipped the auth fix'. " +
      "Copy the note's words exactly; don't rewrite, shorten or fix them.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "text", "confidence"],
      properties: {
        kind: { type: "string", enum: ["content", "journal"], description: "content = an idea for content to make; journal = a work journal entry." },
        text: { type: ["string", "null"], description: "The note's words copied exactly from the message, without a 'content idea:' or 'journal:' label. Null if the whole message is the note." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const kind = input.kind === "journal" ? "journal" : "content";
    // The owner's own words: the model's span if it appears verbatim in the message
    // (needed when the note shares a message with other items), else the whole
    // message minus a leading label.
    const span = verbatim(input.text, ctx.text);
    const m = ctx.text.match(NOTE_PREFIX);
    const body = span ?? (m ? ctx.text.slice(m[0].length) : ctx.text);
    if (!body.trim()) return { status: "invalid", detail: "The note is empty." };
    return {
      status: "ready",
      resolved: { kind, date: ctx.today, body },
      fields: [["Kind", kind === "journal" ? "Work journal" : "Content idea"], ["Text", body]],
      warnings: [],
    };
  },
  async commit(r, db) {
    const out = await rpc(db, "add_note", { p_kind: r.kind, p_date: r.date, p_body: r.body, p_tool: "add_note" });
    if (out?.status !== "saved") return { status: "failed" };
    const body = String(r.body);
    return {
      status: "saved",
      label: `${r.kind === "journal" ? "Journal" : "Content idea"}: ${body.length > 60 ? `${body.slice(0, 60)}…` : body}`,
      actionId: out.action_id ?? null,
    };
  },
};

// ---- Food library --------------------------------------------------------------------

type MealRow = Database["public"]["Tables"]["saved_meals"]["Row"];

const saveMeal: ToolDef = {
  name: "save_meal",
  display: "Save meal",
  definition: {
    name: "save_meal",
    description:
      "Create a saved meal, or change one, e.g. 'save chicken breast as 47 cal 9g protein per oz', " +
      "'flatbread pizza is 320 cal now', 'add alias cb to chicken breast'. A saved meal is one portion with fixed macros. " +
      "Not for logging what the owner ate.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "aliases", "unit", "calories", "protein_g", "confidence"],
      properties: {
        name: { type: "string", description: "The meal's name as the owner wrote it." },
        aliases: { type: "array", items: { type: "string" }, description: "Other names the owner gave for it. Empty if none." },
        unit: { type: ["string", "null"], description: "What one portion is, e.g. 'oz', 'scoop', 'serving'. Null if not said." },
        calories: { type: ["number", "null"], description: "Calories per portion the owner typed. Null if not typed." },
        protein_g: { type: ["number", "null"], description: "Protein grams per portion the owner typed. Null if not typed." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const name = String(input.name ?? "").trim();
    if (!name) return { status: "invalid", detail: "No meal named." };
    const calories = typed(input.calories, ctx.text) ? Math.round(input.calories as number) : null;
    const protein = typed(input.protein_g, ctx.text) ? (input.protein_g as number) : null;
    const unit = typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : null;
    const aliases = (Array.isArray(input.aliases) ? input.aliases : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

    const names = (m: SavedMeal) => [m.name, ...m.aliases].map(norm);
    const exact = ctx.meals.find((m) => names(m).includes(norm(name)));
    // A partial name ("flatbread pizza" for "Flatbread pizza homemade") might mean an
    // existing meal: the owner picks, never code.
    const partial = exact ? [] : ctx.meals.filter((m) => names(m).some((n) => n.length >= 3 && (n.includes(norm(name)) || norm(name).includes(n))));

    const editOf = async (existing: SavedMeal): Promise<Check> => {
      // Edit: only what the owner said changes; always confirmed before it's written.
      const { data } = await ctx.db.from("saved_meals").select("*").eq("id", existing.id).single();
      if (!data) return { status: "invalid", detail: `Couldn't load ${existing.name}.` };
      const after = {
        name: data.name,
        aliases: [...new Set([...data.aliases, ...aliases.filter((a) => a !== norm(data.name))])],
        portion_unit: unit ?? data.portion_unit,
        calories: calories ?? data.calories,
        protein_g: protein ?? Number(data.protein_g),
      };
      const fields: [string, string][] = [["Meal", data.name]];
      if (calories != null) fields.push(["Calories", String(calories)]);
      if (protein != null) fields.push(["Protein", `${protein} g`]);
      if (unit) fields.push(["Per", unit]);
      if (after.aliases.length !== data.aliases.length) fields.push(["Aliases", after.aliases.join(", ")]);
      if (fields.length === 1) return { status: "invalid", detail: `Nothing to change on ${data.name}.` };
      fields[0] = ["Change", data.name];
      return { status: "ready", resolved: { mode: "update", id: data.id, before: data as unknown as Json, after }, fields, warnings: [] };
    };

    if (exact) return editOf(exact);

    const resolved: Resolved = { mode: "create", name, aliases, unit: unit ?? "serving", calories, protein_g: protein };
    const missing: MissingField[] = [];
    if (calories == null) missing.push({ name: "calories", label: "Calories per portion" });
    if (protein == null) missing.push({ name: "protein_g", label: "Protein (g) per portion" });
    const create: Check = missing.length
      ? { status: "missing", resolved, title: `Save "${name}"`, missing }
      : {
          status: "ready",
          resolved,
          fields: [["New meal", name], ["Per", unit ?? "serving"], ["Calories", String(calories)], ["Protein", `${protein} g`], ...(aliases.length ? [["Aliases", aliases.join(", ")] as [string, string]] : [])],
          warnings: foodWarnings(calories!, protein!),
        };
    if (!partial.length) return create;

    const options: { resolved: Resolved; fields: [string, string][] }[] = [];
    for (const m of partial.slice(0, 3)) {
      const e = await editOf(m);
      if (e.status === "ready") options.push({ resolved: e.resolved, fields: e.fields });
    }
    if (create.status === "ready" && options.length < 3) options.push({ resolved: create.resolved, fields: create.fields });
    return options.length ? { status: "ambiguous", options } : create;
  },
  fill: (r, values) => logFood.fill!(r, values),
  async commit(r, db) {
    if (r.mode === "update") {
      const before = r.before as unknown as MealRow;
      const after = r.after as { name: string; aliases: string[]; portion_unit: string; calories: number; protein_g: number };
      const changes: Change[] = [];
      if (after.calories !== before.calories) changes.push({ field: "Calories", from: String(before.calories), to: String(after.calories) });
      if (after.protein_g !== Number(before.protein_g)) changes.push({ field: "Protein", from: `${g(before.protein_g)} g`, to: `${g(after.protein_g)} g` });
      if (after.portion_unit !== before.portion_unit) changes.push({ field: "Per", from: before.portion_unit, to: after.portion_unit });
      if (after.aliases.join(",") !== before.aliases.join(",")) changes.push({ field: "Aliases", from: before.aliases.join(", ") || "–", to: after.aliases.join(", ") });
      return { status: "confirm", title: `Change ${before.name}?`, changes, tool: "update_meal", resolved: { id: before.id, ...after } };
    }
    const out = await rpc(db, "save_meal", {
      p_name: r.name, p_aliases: r.aliases, p_portion_unit: r.unit, p_calories: r.calories, p_protein_g: r.protein_g, p_tool: "save_meal",
    });
    if (out?.status === "conflict") return { status: "failed", detail: `A saved meal named "${r.name}" already exists.` };
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Saved meal ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein per ${row.portion_unit}`, actionId: out.action_id ?? null };
  },
};

/** Only reachable from a confirm card ("Change Flatbread pizza?"). */
const updateMeal: ToolDef = {
  name: "update_meal",
  display: "Save meal",
  async commit(r, db) {
    const out = await rpc(db, "update_meal", {
      p_id: r.id, p_name: r.name, p_aliases: r.aliases, p_portion_unit: r.portion_unit,
      p_calories: r.calories, p_protein_g: r.protein_g, p_carbs_g: null, p_fat_g: null, p_tool: "save_meal",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Saved meal ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein per ${row.portion_unit}`, actionId: out.action_id ?? null };
  },
};

// ---- Job search ----------------------------------------------------------------------

// Mirrors BASE_STATUSES in lib/applicationsData.ts (a client module, so not imported here).
const STATUSES = ["Applied", "OA Stage", "Interview", "Offer", "Rejected"];

/** The owner's status word mapped onto a known status; anything else is kept as typed. */
function statusOf(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim().toLowerCase();
  const alias: Record<string, string> = { rejected: "Rejected", reject: "Rejected", denied: "Rejected", oa: "OA Stage", "oa stage": "OA Stage", interview: "Interview", interviewing: "Interview", offer: "Offer", applied: "Applied" };
  return alias[t] ?? STATUSES.find((x) => x.toLowerCase() === t) ?? s.trim();
}

type AppRow = Database["public"]["Tables"]["applications"]["Row"];
const appFields = (a: Pick<AppRow, "position" | "applied_date" | "status">): [string, string][] => [
  ["Position", a.position], ["Applied", fmtDay(a.applied_date)], ["Status", a.status],
];

async function appsFor(db: Db, company: string) {
  const { data } = await db.from("applications").select("*").is("deleted_at", null).ilike("company", company.trim())
    .order("applied_date", { ascending: false });
  return data ?? [];
}

/** The fields a new application still needs, asked for rather than defaulted. */
function missingAppFields(r: Resolved): MissingField[] {
  const m: MissingField[] = [];
  if (!r.position) m.push({ name: "position", label: "Position", type: "text" });
  if (!r.applied_date) m.push({ name: "applied_date", label: "Date applied", type: "date" });
  if (!r.status) m.push({ name: "status", label: "Status", type: "select", options: STATUSES });
  if (r.resume_name == null) m.push({ name: "resume_name", label: "Resume name", type: "text", optional: true });
  return m;
}

const addApplication: ToolDef = {
  name: "add_application",
  display: "Application",
  definition: {
    name: "add_application",
    description:
      "A new job application, e.g. 'applied to Stripe for SWE today'. Fill only what the owner said; code asks for the rest. " +
      "Not for status changes on an existing application, and not for OAs or interviews.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["company", "position", "applied_days_ago", "status", "resume_name", "confidence"],
      properties: {
        company: { type: "string" },
        position: { type: ["string", "null"], description: "Role as the owner wrote it. Null if not said." },
        applied_days_ago: { type: ["integer", "null"], description: "0 if the owner said today, 1 for yesterday, and so on. Null if they didn't say when." },
        status: { type: ["string", "null"], description: "Only if the owner said one. Null otherwise." },
        resume_name: { type: ["string", "null"], description: "Resume file name, copied exactly. Null if not said." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const company = String(input.company ?? "").trim();
    if (!company) return { status: "invalid", detail: "No company named." };
    const days = input.applied_days_ago;
    const resolved: Resolved = {
      company,
      position: typeof input.position === "string" && input.position.trim() ? input.position.trim() : null,
      applied_date: typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 365 ? addDays(ctx.today, -days) : null,
      status: statusOf(input.status),
      resume_name: verbatim(input.resume_name, ctx.text),
    };
    const missing = missingAppFields(resolved);
    if (missing.length) return { status: "missing", resolved, title: `Application: ${company}`, missing };
    const existing = (await appsFor(ctx.db, company)).filter((a) => a.position.toLowerCase() === String(resolved.position).toLowerCase());
    return {
      status: "ready",
      resolved,
      fields: [["Company", company], ...appFields(resolved as unknown as AppRow)],
      warnings: existing.length ? [`You already have a ${company} ${resolved.position} application from ${fmtDay(existing[0].applied_date)}.`] : [],
    };
  },
  fill(r, values) {
    const out = { ...r };
    for (const k of ["position", "applied_date", "status"] as const) {
      if (out[k]) continue;
      const v = String(values[k] ?? "").trim();
      if (!v) return "Fill in position, date and status.";
      if (k === "applied_date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Date must be a date.";
      out[k] = k === "status" ? statusOf(v) : v;
    }
    if (out.resume_name == null) out.resume_name = String(values.resume_name ?? "").trim() || null;
    return out;
  },
  async commit(r, db) {
    if (missingAppFields(r).some((m) => !m.optional)) return { status: "failed", detail: "Position, date and status are required." };
    const out = await rpc(db, "save_application", {
      p_company: r.company, p_position: r.position, p_applied_date: r.applied_date, p_status: r.status, p_resume_name: r.resume_name, p_tool: "add_application",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Application: ${row.company}, ${row.position} (${row.status}, ${fmtDay(String(row.applied_date))})`, actionId: out.action_id ?? null };
  },
};

const updateApplication: ToolDef = {
  name: "update_application",
  display: "Application update",
  definition: {
    name: "update_application",
    description:
      "A change to an existing application, usually its status, e.g. 'Roblox rejected', 'Stripe moved to OA stage'. " +
      "Not for new applications, and not for logging an OA or interview itself.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["company", "status", "position", "resume_name", "confidence"],
      properties: {
        company: { type: "string" },
        status: { type: ["string", "null"], description: "New status, in the owner's word (e.g. 'rejected'). Null if unchanged." },
        position: { type: ["string", "null"], description: "New position, only if the owner is changing it. Null otherwise." },
        resume_name: { type: ["string", "null"], description: "New resume name, copied exactly, only if changing it. Null otherwise." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const company = String(input.company ?? "").trim();
    const apps = company ? await appsFor(ctx.db, company) : [];
    if (!apps.length) return { status: "invalid", detail: `No application for ${company || "that company"}.` };
    const status = statusOf(input.status);
    const position = typeof input.position === "string" && input.position.trim() ? input.position.trim() : null;
    const resume = verbatim(input.resume_name, ctx.text);
    if (!status && !position && !resume) return { status: "invalid", detail: "Nothing to change." };
    const toOption = (a: AppRow) => ({
      resolved: {
        id: a.id, company: a.company, applied_date: a.applied_date,
        position: position ?? a.position, status: status ?? a.status, resume_name: resume ?? a.resume_name,
        before: { position: a.position, status: a.status, resume_name: a.resume_name },
      } as Resolved,
      fields: [["Company", a.company], ...appFields(a), ...(status ? [["New status", status] as [string, string]] : [])] as [string, string][],
    });
    // Several applications at one company (e.g. Google): the owner picks which.
    if (apps.length > 1) return { status: "ambiguous", options: apps.slice(0, 3).map(toOption) };
    return { status: "ready", ...toOption(apps[0]), warnings: [] };
  },
  async commit(r) {
    const b = r.before as { position: string; status: string; resume_name: string | null };
    const changes: Change[] = [];
    if (r.status !== b.status) changes.push({ field: "Status", from: b.status, to: String(r.status) });
    if (r.position !== b.position) changes.push({ field: "Position", from: b.position, to: String(r.position) });
    if (r.resume_name !== b.resume_name) changes.push({ field: "Resume", from: b.resume_name ?? "–", to: String(r.resume_name) });
    if (!changes.length) return { status: "failed", detail: "Nothing changes." };
    // Edits are always confirmed, whatever the confidence.
    return { status: "confirm", title: `Update ${r.company} application?`, changes, tool: "apply_application_update", resolved: r };
  },
};

/** Only reachable from the confirm card above. */
const applyApplicationUpdate: ToolDef = {
  name: "apply_application_update",
  display: "Application update",
  async commit(r, db) {
    const out = await rpc(db, "update_application", {
      p_id: r.id, p_company: r.company, p_position: r.position, p_applied_date: r.applied_date, p_status: r.status,
      p_resume_name: r.resume_name, p_tool: "update_application",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    return { status: "saved", label: `${out.row.company} application: ${out.row.status}`, actionId: out.action_id ?? null };
  },
};

const logCallback: ToolDef = {
  name: "log_callback",
  display: "Callback",
  definition: {
    name: "log_callback",
    description:
      "An OA, interview or recruiter call with a company, e.g. 'TikTok OA 508/600', 'Stripe onsite went okay'. " +
      "Any reflection on how it went is the debrief: copy it exactly, never rewrite, shorten or soften it. " +
      "Not for application status changes ('Roblox rejected').",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["company", "kind", "score", "outcome", "debrief", "days_ago", "confidence"],
      properties: {
        company: { type: "string" },
        kind: { type: "string", enum: ["OA", "Interview", "Recruiter"], description: "OA = online assessment (CodeSignal, HackerRank). Recruiter = recruiter call." },
        score: { anyOf: [{ type: "string" }, { type: "null" }], description: "Score exactly as written, e.g. '508/600'. Null if none." },
        outcome: { anyOf: [{ type: "string" }, { type: "null" }], description: "Only if the owner states one (e.g. 'rejected', 'moved on'). Null otherwise." },
        debrief: { anyOf: [{ type: "string" }, { type: "null" }], description: "The owner's own words about how it went, copied exactly. Null if none." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const company = String(input.company ?? "").trim();
    if (!company) return { status: "invalid", detail: "No company named." };
    const kind = ["OA", "Interview", "Recruiter"].includes(String(input.kind)) ? String(input.kind) : "Interview";
    // The debrief is the owner's own words: the model's span if it's verbatim, else the
    // whole message, so nothing they wrote is ever reworded or lost.
    const debrief = input.debrief == null ? null : (verbatim(input.debrief, ctx.text) ?? ctx.text);
    const outcome = typeof input.outcome === "string" && input.outcome.trim() ? input.outcome.trim() : null;
    const date = dateFor(input, ctx.today);
    const resolved: Resolved = { date, company, kind, score: verbatim(input.score, ctx.text), outcome, debrief };
    const fields: [string, string][] = [["Company", company], ["Type", kind], ["Date", fmtDay(date)]];
    if (resolved.score) fields.push(["Score", String(resolved.score)]);
    if (outcome) fields.push(["Outcome", outcome]);
    return { status: "ready", resolved, fields, warnings: [] };
  },
  async commit(r, db) {
    const out = await rpc(db, "log_callback", {
      p_date: r.date, p_company: r.company, p_kind: r.kind, p_score: r.score, p_outcome: r.outcome, p_debrief: r.debrief, p_tool: "log_callback",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    const saved: Commit = {
      status: "saved",
      label: `${row.company} ${row.kind}${row.score ? ` ${row.score}` : ""}, ${fmtDay(String(row.logical_date))}`,
      actionId: out.action_id ?? null,
    };
    // No application for this company: offer to add one. Nothing is created automatically.
    if ((out as { has_application?: boolean }).has_application === false) {
      const draft: Resolved = { company: String(row.company), position: null, applied_date: null, status: null, resume_name: null };
      saved.offer = { tool: "add_application", resolved: draft, title: `No application for ${row.company} yet. Add one?`, missing: missingAppFields(draft) };
    }
    return saved;
  },
};

const WRITE_TOOLS = [
  "log_weight", "log_saved_meal", "log_food", "log_leetcode", "add_note",
  "save_meal", "add_application", "update_application", "log_callback",
] as const;

/** Returned when nothing fits confidently. Its candidates become the "Where does this go?" options. */
export const NO_MATCH: Anthropic.Tool = {
  name: "no_match",
  description:
    "Use when no tool clearly fits, or you'd be guessing. List up to 3 plausible readings, most likely first, " +
    "each with the arguments that tool would take as a JSON string.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tool", "args_json", "confidence"],
          properties: {
            tool: { type: "string", enum: [...WRITE_TOOLS] },
            args_json: { type: "string", description: "That tool's arguments as a JSON object." },
            confidence,
          },
        },
      },
    },
  },
};

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(
  [
    logWeight, updateWeight, logSavedMeal, logFood, logLeetcode, addNote,
    saveMeal, updateMeal, addApplication, updateApplication, applyApplicationUpdate, logCallback,
  ].map((t) => [t.name, t]),
);

/**
 * The model's tool list, in a fixed order so the request prefix stays identical.
 * Strict tools together may declare at most 16 nullable/union fields (an API limit);
 * check this when adding a strict tool.
 */
export const MODEL_TOOLS: Anthropic.Tool[] = [...WRITE_TOOLS.map((n) => TOOLS[n].definition!), NO_MATCH];
