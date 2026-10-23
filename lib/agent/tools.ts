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
import { fmtDuration, parseDuration } from "@/lib/duration";
import { foodWarnings, leetcodeWarnings, portionWarnings, runWarnings, weightWarnings } from "@/lib/validate";
import type { MissingField } from "./cards";
import { closest, nameScore } from "./fuzzy";
import { matchTitle } from "./lcMatch";

export type Db = SupabaseClient<Database>;

export interface SavedMeal {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  /** Ingredient tags: servings of a library food per portion. Empty when untagged. */
  items: { foodId: string; servings: number }[];
}

/** A food in the owner's library. */
export interface LibFood {
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
  foods: LibFood[];
  /** Archived tab keys (settings.archived_tabs). Chat refuses to write to these. */
  archived?: ReadonlySet<string>;
  /** The tab chip the owner picked for this message, if any: only its tools apply. */
  tab?: import("@/lib/tabs").ChatTab;
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
/** "28:14" -> 28.23, "1:02:05" -> 62.08, "1h 13m" -> 73, "20 minutes" -> 20. Null when unreadable. */
function parseMinutes(t: string | null): number | null {
  const secs = t ? parseDuration(t) : null;
  return secs == null ? null : Math.round((secs / 60) * 100) / 100;
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

const KM_PER_MI = 1.609344;

const logRun: ToolDef = {
  name: "log_run",
  display: "Run",
  definition: {
    name: "log_run",
    description:
      "A run the owner did, with distance and time, e.g. 'ran 3.1 miles in 27:30', '5k in 26 min', 'did 4 mi, 36:10'. " +
      "Copy the distance and time exactly as written; code converts units. Not for lifting or walking steps.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["distance", "unit", "time_text", "note", "days_ago", "confidence"],
      properties: {
        distance: { type: ["number", "null"], description: "The distance number the owner typed ('5k' = 5). Null if not said." },
        unit: { anyOf: [{ type: "string", enum: ["mi", "km"] }, { type: "null" }], description: "mi for miles, km for km or 'k'. Null if not said." },
        time_text: { type: ["string", "null"], description: "The time exactly as written, e.g. '27:30', '26 min', '1:02:05'. Null if not said." },
        note: { type: ["string", "null"], description: "Any remark about the run, copied exactly. Null if none." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const date = dateFor(input, ctx.today);
    const typedDistance = typed(input.distance, ctx.text) && (input.distance as number) > 0 ? (input.distance as number) : null;
    const km = input.unit === "km";
    const miles = typedDistance == null ? null : Math.round((km ? typedDistance / KM_PER_MI : typedDistance) * 100) / 100;
    const timeText = verbatim(input.time_text, ctx.text);
    const seconds = timeText ? parseDuration(timeText) : null;
    const note = verbatim(input.note, ctx.text);
    const resolved: Resolved = { date, miles, seconds, note };
    const missing: MissingField[] = [];
    if (miles == null) missing.push({ name: "miles", label: "Distance (mi)" });
    if (!seconds) missing.push({ name: "time", label: "Time (e.g. 27:30)", type: "text" });
    if (missing.length) return { status: "missing", resolved, title: "Log run", missing };
    const fields: [string, string][] = [
      ["Distance", km ? `${typedDistance} km (${miles} mi)` : `${miles} mi`],
      ["Time", fmtDuration(seconds!)],
      ["Pace", `${fmtDuration(seconds! / miles!)}/mi`],
      ["Date", fmtDay(date)],
    ];
    if (note) fields.push(["Note", note]);
    return { status: "ready", resolved, fields, warnings: runWarnings(miles!, seconds!) };
  },
  fill(r, values) {
    const out = { ...r };
    if (out.miles == null) {
      const v = Number(values.miles);
      if (!Number.isFinite(v) || v <= 0) return "Distance must be more than 0.";
      out.miles = v;
    }
    if (!out.seconds) {
      const s = parseDuration(String(values.time ?? ""));
      if (!s) return "Time must look like 27:30, 1:02:05 or 27 min.";
      out.seconds = s;
    }
    return out;
  },
  async commit(r, db) {
    const out = await rpc(db, "log_run", { p_date: r.date, p_distance_mi: r.miles, p_duration_sec: r.seconds, p_note: r.note, p_tool: "log_run" });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    const miles = num(row.distance_mi);
    const secs = num(row.duration_sec);
    const cal = row.calories_est == null ? "" : `, ~${row.calories_est} cal est.`;
    return {
      status: "saved",
      label: `Run ${g(miles)} mi in ${fmtDuration(secs)} (${fmtDuration(secs / miles)}/mi)${cal}, ${fmtDay(String(row.logical_date))}`,
      actionId: out.action_id ?? null,
    };
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

// ---- Food library lookups ------------------------------------------------------------

const namesOf = (f: { name: string; aliases: string[] }) => [f.name, ...f.aliases].map(norm);

/**
 * "guac" against the food list: an exact name or alias wins; otherwise the closest
 * names come back as options for the owner to pick. Never decides on a guess.
 */
function findFoods(q: string, foods: LibFood[]): { exact: LibFood | null; options: LibFood[] } {
  const k = norm(q);
  if (!k) return { exact: null, options: [] };
  const exact = foods.filter((f) => namesOf(f).includes(k));
  if (exact.length === 1) return { exact: exact[0], options: [] };
  if (exact.length > 1) return { exact: null, options: exact.slice(0, 3) };
  const partial = foods.filter((f) => [f.name, ...f.aliases].some((n) => wordsMatch(q, n)));
  const fuzzy = closest(k, foods, (f) => [f.name, ...f.aliases]).map((x) => x.item);
  const score = (f: LibFood) => Math.max(...[f.name, ...f.aliases].map((n) => nameScore(k, n)));
  const options = [...new Map([...partial, ...fuzzy].map((f) => [f.id, f])).values()].sort((a, b) => score(b) - score(a)).slice(0, 3);
  return { exact: null, options };
}

/**
 * One food for `q` from a list, or a message saying why not. Used inside a list the
 * owner gave (a meal's ingredients, "with a side tortilla"), where a single name
 * containing the words ("guac" -> "Chipotle Guacamole") is unambiguous.
 */
function pickFood(q: string, foods: LibFood[], where: string): LibFood | string {
  const found = findFoods(q, foods);
  if (found.exact) return found.exact;
  // Every meaningful word the owner used starts a word of exactly one name:
  // "guac" -> Chipotle Guacamole, "tortilla on the side" -> Chipotle Side Tortilla.
  const covered = foods.filter((f) => [f.name, ...f.aliases].some((n) => wordsMatch(q, n)));
  if (covered.length === 1) return covered[0];
  if (found.options.length > 1) return `"${q}" could be ${found.options.map((f) => f.name).join(" or ")}.`;
  if (found.options.length === 1) return `No "${q}" in ${where}. Did you mean ${found.options[0].name}?`;
  return `No "${q}" in ${where}.`;
}

const FILLER = new Set(["a", "an", "the", "of", "on", "with", "some", "my", "extra", "and"]);
/** Lowercase words without filler, singular-ish ("tortillas" -> "tortilla"). */
const wordsOf = (t: string) =>
  norm(t).split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w)).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

/**
 * True when every word of `q` (3+ letters, filler dropped) starts a word of `name`.
 * Word-based on purpose: "egg" must not match "Fajita Veggies".
 */
function wordsMatch(q: string, name: string) {
  const qw = wordsOf(q);
  const nw = wordsOf(name);
  return qw.length > 0 && qw.every((w) => w.length >= 3 && nw.some((n) => n.startsWith(w)));
}

type ItemIn = { food?: unknown; servings?: unknown };
const listOf = (v: unknown) => (Array.isArray(v) ? (v as ItemIn[]) : []);
const servingsOf = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
const countName = (servings: number, name: string) => (servings === 1 ? name : `${g(servings)}× ${name}`);

const itemSchema = (servingsHelp: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["food", "servings"],
  properties: {
    food: { type: "string", description: "The food as the owner wrote it, e.g. 'guac'." },
    servings: { type: ["number", "null"], description: servingsHelp },
  },
});

const logSavedMeal: ToolDef = {
  name: "log_saved_meal",
  display: "Saved meal",
  definition: {
    name: "log_saved_meal",
    description:
      "One of the owner's saved meals, named in the message (see the saved meals list). Use only when the owner names " +
      "a saved meal or one of its aliases; a generic word like 'breakfast' or 'lunch' alone is not a saved meal. " +
      "Changes to it go here too: ingredients left out ('without guac', 'one less chicken') in without, and foods from " +
      "the food list eaten with it ('with a side tortilla') in extra. Not for foods that aren't in either list.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["meal", "portions", "without", "extra", "days_ago", "confidence"],
      properties: {
        meal: { type: "string", description: "The saved meal name or alias as the owner wrote it." },
        portions: { type: ["number", "null"], description: "How many portions the owner said (e.g. '6 oz' of a per-oz meal is 6, 'half' is 0.5). Null if not said." },
        without: {
          type: "array",
          items: itemSchema("How many servings of it to leave out ('one less chicken' = 1). Null = all of it."),
          description: "Ingredients of this meal the owner left out. Empty if none.",
        },
        extra: {
          type: "array",
          items: itemSchema("How many. Null = 1."),
          description: "Foods from the food list eaten along with this meal. Empty if none.",
        },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const q = norm(String(input.meal ?? ""));
    if (!q) return { status: "invalid", detail: "No saved meal named." };
    const portions = typeof input.portions === "number" && input.portions > 0 ? input.portions : 1;
    const date = dateFor(input, ctx.today);
    const byId = new Map(ctx.foods.map((f) => [f.id, f]));

    // Extras come from the whole food list.
    const extras: { food: LibFood; servings: number }[] = [];
    for (const e of listOf(input.extra)) {
      const f = pickFood(String(e.food ?? ""), ctx.foods, "your food list");
      if (typeof f === "string") return { status: "invalid", detail: f };
      extras.push({ food: f, servings: servingsOf(e.servings, 1) });
    }

    // "Without" only ever matches the chosen meal's own ingredients.
    const minusFor = (m: SavedMeal): { food: LibFood; servings: number; has: number }[] | string => {
      const without = listOf(input.without);
      if (!without.length) return [];
      const ingredients = m.items.map((i) => byId.get(i.foodId)).filter((f): f is LibFood => !!f);
      if (!ingredients.length) return `${m.name} has no ingredients tagged, so nothing can be left out.`;
      const out: { food: LibFood; servings: number; has: number }[] = [];
      for (const w of without) {
        const f = pickFood(String(w.food ?? ""), ingredients, m.name);
        if (typeof f === "string") return f;
        const has = m.items.find((i) => i.foodId === f.id)!.servings;
        const s = servingsOf(w.servings, has);
        if (s > has) return `${m.name} only has ${g(has)} of ${f.name}.`;
        out.push({ food: f, servings: s, has });
      }
      return out;
    };

    const toOption = (m: SavedMeal, alias: string | null = null) => {
      const minus = minusFor(m);
      if (typeof minus === "string") return minus;
      const fields: [string, string][] = [["Meal", m.name], ["Portions", `${portions} ${m.unit}`], ["Date", fmtDay(date)]];
      if (minus.length) fields.push(["Without", minus.map((x) => (x.servings === x.has ? x.food.name : `${g(x.servings)} of ${g(x.has)} ${x.food.name}`)).join(", ")]);
      if (extras.length) fields.push(["Plus", extras.map((x) => countName(x.servings, x.food.name)).join(", ")]);
      if (alias) fields.push(["Adds alias", alias]);
      return {
        resolved: {
          date, meal_id: m.id, portions, alias,
          minus: minus.map((x) => ({ food_id: x.food.id, servings: x.servings })),
          extras: extras.map((x) => ({ food_id: x.food.id, servings: x.servings })),
        } as Resolved,
        fields,
      };
    };
    type Opt = Exclude<ReturnType<typeof toOption>, string>;
    const usable = (list: ReturnType<typeof toOption>[]) => list.filter((o): o is Opt => typeof o !== "string");

    const names = (m: SavedMeal) => [m.name, ...m.aliases].map(norm);
    const exact = ctx.meals.filter((m) => names(m).includes(q));
    if (exact.length === 1) {
      const o = toOption(exact[0]);
      if (typeof o === "string") return { status: "invalid", detail: o };
      return { status: "ready", ...o, warnings: [...portionWarnings(portions), ...extras.flatMap((x) => portionWarnings(x.servings))] };
    }
    if (exact.length > 1) {
      const all = exact.slice(0, 3).map((m) => toOption(m));
      const options = usable(all);
      return options.length ? { status: "ambiguous", title: "Did you mean…", options } : { status: "invalid", detail: String(all[0]) };
    }

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
    const all = suggestions.map((m) => toOption(m, said));
    const options = usable(all);
    return options.length ? { status: "ambiguous", title: "Did you mean…", options } : { status: "invalid", detail: String(all[0]) };
  },
  async commit(r, db) {
    const out = await rpc(db, "log_saved_meal", {
      p_date: r.date, p_meal_id: r.meal_id, p_portions: r.portions, p_tool: "log_saved_meal", p_minus: r.minus ?? [],
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    const saved: Commit = {
      status: "saved",
      label: `${row.description} × ${g(row.amount)} ${row.unit}: ${row.calories} cal, ${g(row.protein_g)} g protein`,
      actionId: out.action_id ?? null,
      also: [],
    };
    // Foods eaten with it: each its own entry, with its own Undo.
    for (const x of (r.extras ?? []) as { food_id: string; servings: number }[]) {
      const e = await rpc(db, "log_food_item", { p_date: r.date, p_food_id: x.food_id, p_servings: x.servings, p_tool: "log_saved_meal" });
      if (e?.status === "saved" && e.row) saved.also!.push({ label: itemLabel(e.row), actionId: e.action_id ?? null });
      else saved.also!.push({ label: "Failed: one of the extra foods wasn't logged.", actionId: null });
    }
    // Picked from "did you mean": remember the owner's wording as an alias.
    if (typeof r.alias === "string" && r.alias) {
      const { data: meal } = await db.from("saved_meals").select("*").eq("id", String(r.meal_id)).is("deleted_at", null).single();
      if (meal && ![meal.name, ...meal.aliases].map(norm).includes(norm(r.alias))) {
        const added = await rpc(db, "update_meal", {
          p_id: meal.id, p_name: meal.name, p_aliases: [...meal.aliases, r.alias], p_portion_unit: meal.portion_unit,
          p_calories: meal.calories, p_protein_g: meal.protein_g, p_carbs_g: meal.carbs_g, p_fat_g: meal.fat_g, p_tool: "log_saved_meal",
        });
        if (added?.status === "saved") saved.also!.push({ label: `Alias "${r.alias}" for ${meal.name}`, actionId: added.action_id ?? null });
      }
    }
    return saved;
  },
};

/** "Chipotle Side Tortilla × 2 serving: 640 cal, 16 g protein" from a food_log row. */
const itemLabel = (row: Record<string, unknown>) => `${row.description} × ${g(row.amount)} ${row.unit}: ${row.calories} cal, ${g(row.protein_g)} g protein`;

const logFood: ToolDef = {
  name: "log_food",
  display: "Food",
  definition: {
    name: "log_food",
    description:
      "Something the owner ate that is not one of their saved meals. If it's in the owner's food list, set food to it and " +
      "servings to how many, and leave the numbers null: code looks them up. Otherwise it's a one-off, e.g. " +
      "'chicken bowl 650 cal 50p': copy calories and protein only if the owner typed the numbers; never estimate them.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["description", "food", "servings", "calories", "protein_g", "carbs_g", "fat_g", "days_ago", "confidence"],
      properties: {
        description: { type: "string", description: "Short name of the food, in the owner's words." },
        food: { type: ["string", "null"], description: "The food-list name or alias it matches, as the owner wrote it. Null if it isn't in the food list." },
        servings: { type: ["number", "null"], description: "How many servings of the food-list food ('two tortillas' = 2, 'half' = 0.5). Null if not said." },
        calories: { type: ["number", "null"], description: "Calories the owner typed. Null if they didn't type a number." },
        protein_g: { type: ["number", "null"], description: "Grams of protein the owner typed. Null if they didn't type a number." },
        carbs_g: { type: ["number", "null"], description: "Grams of carbs the owner typed. Null if not typed." },
        fat_g: { type: ["number", "null"], description: "Grams of fat the owner typed. Null if not typed." },
        days_ago: daysAgo,
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const date = dateFor(input, ctx.today);

    // A food from the library: its stored macros times the servings, computed by the database.
    if (typeof input.food === "string" && input.food.trim()) {
      const servings = servingsOf(input.servings, 1);
      const found = findFoods(input.food, ctx.foods);
      const toOption = (f: LibFood, alias: string | null = null) => ({
        resolved: { mode: "item", date, food_id: f.id, servings, alias } as Resolved,
        fields: [
          ["Food", f.name], ["Servings", `${g(servings)} ${f.unit}`], ["Date", fmtDay(date)],
          ...(alias ? [["Adds alias", alias] as [string, string]] : []),
        ] as [string, string][],
      });
      if (found.exact) return { status: "ready", ...toOption(found.exact), warnings: portionWarnings(servings) };
      // Picking one also saves what the owner typed as an alias, so next time it's exact.
      const said = verbatim(input.food, ctx.text)?.trim().toLowerCase() ?? null;
      if (found.options.length) return { status: "ambiguous", title: "Did you mean…", options: found.options.map((f) => toOption(f, said)) };
      // Not in the library after all: handled as a one-off below.
    }

    const description = String(input.description ?? "").trim();
    if (!description) return { status: "invalid", detail: "No food named." };
    // Numbers the owner didn't type are treated as missing, never as estimates.
    const calories = typed(input.calories, ctx.text) ? Math.round(input.calories as number) : null;
    const protein = typed(input.protein_g, ctx.text) ? (input.protein_g as number) : null;
    const carbs = typed(input.carbs_g, ctx.text) ? (input.carbs_g as number) : null;
    const fat = typed(input.fat_g, ctx.text) ? (input.fat_g as number) : null;
    const resolved: Resolved = { mode: "typed", date, description, calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
    const missing: MissingField[] = [];
    if (calories == null) missing.push({ name: "calories", label: "Calories" });
    if (protein == null) missing.push({ name: "protein_g", label: "Protein (g)" });
    if (missing.length) return { status: "missing", resolved, title: `Log "${description}"`, missing };
    const fields: [string, string][] = [["Food", description], ["Calories", String(calories)], ["Protein", `${protein} g`]];
    if (carbs != null) fields.push(["Carbs", `${carbs} g`]);
    if (fat != null) fields.push(["Fat", `${fat} g`]);
    fields.push(["Date", fmtDay(date)]);
    return { status: "ready", resolved, fields, warnings: foodWarnings(calories!, protein!) };
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
    if (r.mode === "item") {
      const out = await rpc(db, "log_food_item", { p_date: r.date, p_food_id: r.food_id, p_servings: r.servings, p_tool: "log_food" });
      if (out?.status !== "saved" || !out.row) return { status: "failed" };
      const saved: Commit = { status: "saved", label: itemLabel(out.row), actionId: out.action_id ?? null };
      if (typeof r.alias === "string" && r.alias) {
        const { data: food } = await db.from("foods").select("*").eq("id", String(r.food_id)).is("deleted_at", null).single();
        if (food && ![food.name, ...food.aliases].map(norm).includes(norm(r.alias))) {
          const added = await rpc(db, "update_food", {
            p_id: food.id, p_name: food.name, p_aliases: [...food.aliases, r.alias], p_serving_amount: food.serving_amount,
            p_serving_unit: food.serving_unit, p_calories: food.calories, p_protein_g: food.protein_g, p_tool: "log_food",
          });
          if (added?.status === "saved") saved.also = [{ label: `Alias "${r.alias}" for ${food.name}`, actionId: added.action_id ?? null }];
        }
      }
      return saved;
    }
    const out = await rpc(db, "log_food", {
      p_date: r.date, p_description: r.description, p_calories: r.calories, p_protein_g: r.protein_g,
      p_carbs_g: r.carbs_g ?? null, p_fat_g: r.fat_g ?? null, p_tool: "log_food",
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
        title: { type: ["string", "null"], description: "Problem name as the owner wrote it. Null if they didn't name one." },
        time_text: { type: ["string", "null"], description: "The time exactly as written, e.g. '10:00', '25 minutes'. Null if none." },
        hints: { anyOf: [{ type: "string", enum: ["none", "small", "multiple"] }, { type: "null" }], description: "'no hints' = none; one or two small hints = small; a few or more = multiple." },
        result: {
          anyOf: [{ type: "string", enum: ["solved", "optimal", "suboptimal", "failed"] }, { type: "null" }],
          description: "Only from the owner's words: solved/completed/done/got it = solved; optimal only if they say optimal; " +
            "unoptimal/not optimal = suboptimal; failed/gave up/looked at the answer = failed.",
        },
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
    const timeText = verbatim(input.time_text, ctx.text);
    const minutes = parseMinutes(timeText);
    const date = dateFor(input, ctx.today);
    // Not a strict tool, so enum values are checked here; anything else counts as not said.
    const oneOf = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : null);
    const base = {
      date, minutes,
      hints: oneOf(input.hints, ["none", "small", "multiple"]),
      result: oneOf(input.result, ["solved", "optimal", "suboptimal", "failed"]),
      redo: input.redo === true,
      notes: verbatim(input.notes, ctx.text),
      difficulty: oneOf(input.difficulty, ["easy", "medium", "hard"]),
      topic: typeof input.topic === "string" && input.topic.trim() ? input.topic.trim() : null,
    };
    // No name ("leetcode problem"): ask for it rather than fail.
    if (!title) return { status: "missing", resolved: { ...base, title: null }, title: "LeetCode", missing: [{ name: "title", label: "Problem", type: "text" }] };
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
    let known: { title: string; difficulty: string | null } | undefined = hits?.[0];
    if (!known) {
      // Not an exact title or alias: match by words ("encode decode string" -> Encode and Decode Strings).
      const { data: catalog } = await ctx.db.from("lc_catalog").select("title, aliases, difficulty");
      const m = matchTitle(title, catalog ?? []);
      if (m.kind === "match") known = m.entry;
      if (m.kind === "options") {
        // Close but not certain: the owner picks. Picking a catalog problem saves their wording as an alias;
        // the last option keeps the name exactly as typed.
        const said = verbatim(input.title, ctx.text)?.trim() ?? title;
        return {
          status: "ambiguous",
          title: "Did you mean…",
          options: [
            ...m.entries.slice(0, 2).map((e) => ({ resolved: { ...base, title: e.title, alias: said } as Resolved, fields: fieldsFor(e.title, e.difficulty) })),
            { resolved: { ...base, title }, fields: [["Problem", `${title} (as typed)`], ...fieldsFor(title, base.difficulty).slice(1)] as [string, string][] },
          ],
        };
      }
    }
    return {
      status: "ready",
      resolved: { ...base, title: known?.title ?? title },
      fields: fieldsFor(known?.title ?? title, known?.difficulty ?? base.difficulty),
      warnings: leetcodeWarnings(minutes),
    };
  },
  fill(r, values) {
    const t = String(values.title ?? "").trim();
    return t ? { ...r, title: t } : "Problem is required.";
  },
  async commit(r, db) {
    const out = await rpc(db, "log_leetcode", {
      p_date: r.date, p_title: r.title, p_minutes: r.minutes, p_hints: r.hints, p_result: r.result, p_redo: r.redo,
      p_notes: r.notes, p_difficulty: r.difficulty, p_topic: r.topic, p_inferred: true, p_tool: "log_leetcode",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed", detail: out?.status === "ambiguous" ? "That name matches more than one problem." : undefined };
    const row = out.row;
    const bits = [row.difficulty, row.minutes != null ? `${g(row.minutes)} min` : null, row.result].filter(Boolean);
    const saved: Commit = { status: "saved", label: `LeetCode: ${row.title}${bits.length ? ` (${bits.join(", ")})` : ""}`, actionId: out.action_id ?? null };
    // Picked from "Did you mean": remember the owner's wording for that problem.
    if (typeof r.alias === "string" && r.alias && row.catalog_id) {
      const added = await rpc(db, "lc_add_alias", { p_title: row.title, p_alias: r.alias });
      if (added?.status === "saved") saved.also = [{ label: `"${r.alias}" will match ${row.title} next time`, actionId: null }];
    }
    return saved;
  },
};

// "content idea: ...", "journal - ..." prefixes. Everything after is saved byte for byte.
const NOTE_PREFIX = /^\s*(?:content ideas?|content|work journal|personal journal|personal|diary|add to talos|talos improvements?|talos idea|talos|journal)\s*[:\-–—]?\s*/i;

const addNote: ToolDef = {
  name: "add_note",
  display: "Note",
  definition: {
    name: "add_note",
    description:
      "A content idea, a work journal entry or a personal journal entry, e.g. 'content idea: day in the life', " +
      "'journal: shipped the auth fix', 'personal: rough day, called mom', 'add to talos: a watch tab'. " +
      "Copy the note's words exactly; don't rewrite, shorten or fix them.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "text", "confidence"],
      properties: {
        kind: { type: "string", enum: ["content", "journal", "personal", "talos"], description: "content = an idea for content to make; journal = a work journal entry; personal = a personal (non-work) journal entry; talos = an idea, fix or feature for this app (Talos)." },
        text: { type: ["string", "null"], description: "The note's words copied exactly from the message, without a 'content idea:' or 'journal:' label. Null if the whole message is the note." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const kind = input.kind === "journal" || input.kind === "personal" || input.kind === "talos" ? input.kind : "content";
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
      fields: [["Kind", { journal: "Work journal", personal: "Personal journal", talos: "Talos improvement", content: "Content idea" }[kind]], ["Text", body]],
      warnings: [],
    };
  },
  async commit(r, db) {
    const out = await rpc(db, "add_note", { p_kind: r.kind, p_date: r.date, p_body: r.body, p_tool: "add_note" });
    if (out?.status !== "saved") return { status: "failed" };
    const body = String(r.body);
    return {
      status: "saved",
      label: `${{ journal: "Work journal", personal: "Personal journal", talos: "Talos improvement" }[String(r.kind)] ?? "Content idea"}: ${body.length > 60 ? `${body.slice(0, 60)}…` : body}`,
      actionId: out.action_id ?? null,
    };
  },
};

// ---- Food library --------------------------------------------------------------------

type MealRow = Database["public"]["Tables"]["saved_meals"]["Row"];
type FoodRow = Database["public"]["Tables"]["foods"]["Row"];
type MealItemOut = { food_id: string; servings: number };

/** The owner's ingredient list resolved against the food list, or why it can't be. */
function itemsFrom(list: ItemIn[], foods: LibFood[]): { food: LibFood; servings: number }[] | string {
  const out: { food: LibFood; servings: number }[] = [];
  for (const it of list) {
    const f = pickFood(String(it.food ?? ""), foods, "your food list");
    if (typeof f === "string") return `${f} Save it as a food first.`;
    if (out.some((x) => x.food.id === f.id)) return `${f.name} is listed twice.`;
    out.push({ food: f, servings: servingsOf(it.servings, 1) });
  }
  return out;
}

const itemsText = (items: { name: string; servings: number }[]) => items.map((x) => countName(x.servings, x.name)).join(", ") || "none";

const saveMeal: ToolDef = {
  name: "save_meal",
  display: "Save meal",
  definition: {
    name: "save_meal",
    description:
      "Create a saved meal, or change one, e.g. 'save chicken breast as 47 cal 9g protein per oz', " +
      "'flatbread pizza is 320 cal now', 'add alias cb to chicken breast', 'save my usual bowl: rice, chicken, beans'. " +
      "A saved meal is one portion with fixed macros, optionally made of foods from the food list. " +
      "Not for logging what the owner ate.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "aliases", "unit", "calories", "protein_g", "items", "confidence"],
      properties: {
        name: { type: "string", description: "The meal's name as the owner wrote it." },
        aliases: { type: "array", items: { type: "string" }, description: "Other names the owner gave for it. Empty if none." },
        unit: { type: ["string", "null"], description: "What one portion is, e.g. 'oz', 'scoop', 'serving'. Null if not said." },
        calories: { type: ["number", "null"], description: "Calories per portion the owner typed. Null if not typed." },
        protein_g: { type: ["number", "null"], description: "Protein grams per portion the owner typed. Null if not typed." },
        items: {
          type: "array",
          items: itemSchema("Servings of it per portion ('double chicken' = 2). Null = 1."),
          description: "The meal's ingredients from the food list, only if the owner lists them. Empty if not.",
        },
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

    const listed = listOf(input.items);
    const items = itemsFrom(listed, ctx.foods);
    if (typeof items === "string") return { status: "invalid", detail: items };
    const itemsOut: MealItemOut[] | null = listed.length ? items.map((x) => ({ food_id: x.food.id, servings: x.servings })) : null;
    const byId = new Map(ctx.foods.map((f) => [f.id, f]));
    const named = (list: { foodId: string; servings: number }[]) => list.map((i) => ({ name: byId.get(i.foodId)?.name ?? "Unknown food", servings: i.servings }));

    // Ingredient totals, from the stored foods, for a new meal whose numbers weren't typed.
    let fromItems: { cal: number; p: number } | null = null;
    if (items.length) {
      const { data } = await ctx.db.from("foods").select("id, calories, protein_g").in("id", items.map((x) => x.food.id));
      if (!data) return { status: "invalid", detail: "Couldn't load the foods." };
      fromItems = items.reduce((t, x) => {
        const f = data.find((d) => d.id === x.food.id)!;
        return { cal: t.cal + f.calories * x.servings, p: t.p + Number(f.protein_g) * x.servings };
      }, { cal: 0, p: 0 });
      fromItems = { cal: Math.round(fromItems.cal), p: Math.round(fromItems.p * 10) / 10 };
    }

    const names = (m: SavedMeal) => [m.name, ...m.aliases].map(norm);
    const exact = ctx.meals.find((m) => names(m).includes(norm(name)));
    // A partial name ("flatbread pizza" for "Flatbread pizza homemade") might mean an
    // existing meal: the owner picks, never code.
    const partial = exact ? [] : ctx.meals.filter((m) => names(m).some((n) => n.length >= 3 && (n.includes(norm(name)) || norm(name).includes(n))));

    const editOf = async (existing: SavedMeal): Promise<Check> => {
      // Edit: only what the owner said changes; always confirmed before it's written.
      // Ingredients never rewrite the meal's own totals.
      const { data } = await ctx.db.from("saved_meals").select("*").eq("id", existing.id).single();
      if (!data) return { status: "invalid", detail: `Couldn't load ${existing.name}.` };
      const after = {
        name: data.name,
        aliases: [...new Set([...data.aliases, ...aliases.filter((a) => a !== norm(data.name))])],
        portion_unit: unit ?? data.portion_unit,
        calories: calories ?? data.calories,
        protein_g: protein ?? Number(data.protein_g),
        items: itemsOut,
      };
      const fields: [string, string][] = [["Meal", data.name]];
      if (calories != null) fields.push(["Calories", String(calories)]);
      if (protein != null) fields.push(["Protein", `${protein} g`]);
      if (unit) fields.push(["Per", unit]);
      if (after.aliases.length !== data.aliases.length) fields.push(["Aliases", after.aliases.join(", ")]);
      const ingredients = itemsOut ? { from: itemsText(named(existing.items)), to: itemsText(items.map((x) => ({ name: x.food.name, servings: x.servings }))) } : null;
      if (ingredients && ingredients.from !== ingredients.to) fields.push(["Ingredients", ingredients.to]);
      if (fields.length === 1) return { status: "invalid", detail: `Nothing to change on ${data.name}.` };
      fields[0] = ["Change", data.name];
      return { status: "ready", resolved: { mode: "update", id: data.id, before: data as unknown as Json, after, ingredients }, fields, warnings: [] };
    };

    if (exact) return editOf(exact);

    const cal = calories ?? fromItems?.cal ?? null;
    const p = protein ?? fromItems?.p ?? null;
    const resolved: Resolved = { mode: "create", name, aliases, unit: unit ?? "serving", calories: cal, protein_g: p, items: itemsOut };
    const missing: MissingField[] = [];
    if (cal == null) missing.push({ name: "calories", label: "Calories per portion" });
    if (p == null) missing.push({ name: "protein_g", label: "Protein (g) per portion" });
    const fields: [string, string][] = [
      ["New meal", name], ["Per", unit ?? "serving"],
      ["Calories", `${cal}${calories == null && fromItems ? " (from ingredients)" : ""}`],
      ["Protein", `${p} g${protein == null && fromItems ? " (from ingredients)" : ""}`],
    ];
    if (items.length) fields.push(["Ingredients", itemsText(items.map((x) => ({ name: x.food.name, servings: x.servings })))]);
    if (aliases.length) fields.push(["Aliases", aliases.join(", ")]);
    const create: Check = missing.length
      ? { status: "missing", resolved, title: `Save "${name}"`, missing }
      : { status: "ready", resolved, fields, warnings: foodWarnings(cal!, p!) };
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
      const after = r.after as { name: string; aliases: string[]; portion_unit: string; calories: number; protein_g: number; items: MealItemOut[] | null };
      const ingredients = r.ingredients as { from: string; to: string } | null;
      const changes: Change[] = [];
      if (after.calories !== before.calories) changes.push({ field: "Calories", from: String(before.calories), to: String(after.calories) });
      if (after.protein_g !== Number(before.protein_g)) changes.push({ field: "Protein", from: `${g(before.protein_g)} g`, to: `${g(after.protein_g)} g` });
      if (after.portion_unit !== before.portion_unit) changes.push({ field: "Per", from: before.portion_unit, to: after.portion_unit });
      if (after.aliases.join(",") !== before.aliases.join(",")) changes.push({ field: "Aliases", from: before.aliases.join(", ") || "–", to: after.aliases.join(", ") });
      if (ingredients && ingredients.from !== ingredients.to) changes.push({ field: "Ingredients", from: ingredients.from, to: ingredients.to });
      return { status: "confirm", title: `Change ${before.name}?`, changes, tool: "update_meal", resolved: { id: before.id, ...after } };
    }
    const out = await rpc(db, "save_meal", {
      p_name: r.name, p_aliases: r.aliases, p_portion_unit: r.unit, p_calories: r.calories, p_protein_g: r.protein_g, p_tool: "save_meal",
    });
    if (out?.status === "conflict") return { status: "failed", detail: `A saved meal named "${r.name}" already exists.` };
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    const saved: Commit = { status: "saved", label: `Saved meal ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein per ${row.portion_unit}`, actionId: out.action_id ?? null };
    const items = r.items as MealItemOut[] | null;
    if (items?.length) {
      const set = await rpc(db, "set_meal_items", { p_meal_id: row.id, p_items: items, p_tool: "save_meal" });
      saved.also = [{ label: set?.status === "saved" ? `${items.length} ingredients tagged on ${row.name}` : `Failed: ingredients for ${row.name} weren't saved.`, actionId: null }];
    }
    return saved;
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
    const saved: Commit = { status: "saved", label: `Saved meal ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein per ${row.portion_unit}`, actionId: out.action_id ?? null };
    const items = r.items as MealItemOut[] | null | undefined;
    if (items) {
      const set = await rpc(db, "set_meal_items", { p_meal_id: r.id, p_items: items, p_tool: "save_meal" });
      saved.also = [{ label: set?.status === "saved" ? `Ingredients updated on ${row.name}` : `Failed: ingredients for ${row.name} weren't saved.`, actionId: null }];
    }
    return saved;
  },
};

const perText = (amount: unknown, unit: unknown) => (num(amount) === 1 ? `per ${unit}` : `per ${g(amount)} ${unit}`);

const saveFood: ToolDef = {
  name: "save_food",
  display: "Save food",
  definition: {
    name: "save_food",
    description:
      "Add a single food to the owner's food list (one serving with fixed macros), or change one, e.g. " +
      "'save egg as 70 cal 6g protein', 'side tortilla is 300 cal now', 'add alias guac to Chipotle Guacamole'. " +
      "Not for logging what the owner ate, and not for meals made of several foods (that's save_meal).",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "aliases", "serving_amount", "serving_unit", "calories", "protein_g", "confidence"],
      properties: {
        name: { type: "string", description: "The food's name as the owner wrote it." },
        aliases: { type: "array", items: { type: "string" }, description: "Other names the owner gave for it. Empty if none." },
        serving_amount: { type: ["number", "null"], description: "Size of one serving if the owner typed it, e.g. 100 for '100 g'. Null if not said." },
        serving_unit: { type: ["string", "null"], description: "Unit of one serving, e.g. 'g', 'oz', 'tortilla'. Null if not said." },
        calories: { type: ["number", "null"], description: "Calories per serving the owner typed. Null if not typed." },
        protein_g: { type: ["number", "null"], description: "Protein grams per serving the owner typed. Null if not typed." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const name = String(input.name ?? "").trim();
    if (!name) return { status: "invalid", detail: "No food named." };
    const calories = typed(input.calories, ctx.text) ? Math.round(input.calories as number) : null;
    const protein = typed(input.protein_g, ctx.text) ? (input.protein_g as number) : null;
    const amount = typed(input.serving_amount, ctx.text) && (input.serving_amount as number) > 0 ? (input.serving_amount as number) : null;
    const unit = typeof input.serving_unit === "string" && input.serving_unit.trim() ? input.serving_unit.trim() : null;
    const aliases = (Array.isArray(input.aliases) ? input.aliases : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

    const editOf = async (existing: LibFood): Promise<Check> => {
      const { data } = await ctx.db.from("foods").select("*").eq("id", existing.id).single();
      if (!data) return { status: "invalid", detail: `Couldn't load ${existing.name}.` };
      const after = {
        name: data.name,
        aliases: [...new Set([...data.aliases, ...aliases.filter((a) => a !== norm(data.name))])],
        serving_amount: amount ?? Number(data.serving_amount),
        serving_unit: unit ?? data.serving_unit,
        calories: calories ?? data.calories,
        protein_g: protein ?? Number(data.protein_g),
      };
      const fields: [string, string][] = [["Change", data.name]];
      if (calories != null) fields.push(["Calories", String(calories)]);
      if (protein != null) fields.push(["Protein", `${protein} g`]);
      if (amount != null || unit) fields.push(["Serving", `${g(after.serving_amount)} ${after.serving_unit}`]);
      if (after.aliases.length !== data.aliases.length) fields.push(["Aliases", after.aliases.join(", ")]);
      if (fields.length === 1) return { status: "invalid", detail: `Nothing to change on ${data.name}.` };
      return { status: "ready", resolved: { mode: "update", id: data.id, before: data as unknown as Json, after }, fields, warnings: [] };
    };

    const found = findFoods(name, ctx.foods);
    if (found.exact) return editOf(found.exact);

    const resolved: Resolved = { mode: "create", name, aliases, serving_amount: amount ?? 1, serving_unit: unit ?? "serving", calories, protein_g: protein };
    const missing: MissingField[] = [];
    if (calories == null) missing.push({ name: "calories", label: "Calories per serving" });
    if (protein == null) missing.push({ name: "protein_g", label: "Protein (g) per serving" });
    const fields: [string, string][] = [
      ["New food", name], ["Serving", `${g(amount ?? 1)} ${unit ?? "serving"}`], ["Calories", String(calories)], ["Protein", `${protein} g`],
    ];
    if (aliases.length) fields.push(["Aliases", aliases.join(", ")]);
    const create: Check = missing.length
      ? { status: "missing", resolved, title: `Save food "${name}"`, missing }
      : { status: "ready", resolved, fields, warnings: foodWarnings(calories!, protein!) };

    // A close name ("side tortilla" for "Chipotle Side Tortilla") might mean that food: the owner picks.
    if (!found.options.length) return create;
    const options: { resolved: Resolved; fields: [string, string][] }[] = [];
    for (const f of found.options) {
      const e = await editOf(f);
      if (e.status === "ready") options.push({ resolved: e.resolved, fields: e.fields });
    }
    if (create.status === "ready" && options.length < 3) options.push({ resolved: create.resolved, fields: create.fields });
    return options.length ? { status: "ambiguous", options } : create;
  },
  fill: (r, values) => logFood.fill!(r, values),
  async commit(r, db) {
    if (r.mode === "update") {
      const before = r.before as unknown as FoodRow;
      const after = r.after as { name: string; aliases: string[]; serving_amount: number; serving_unit: string; calories: number; protein_g: number };
      const changes: Change[] = [];
      if (after.calories !== before.calories) changes.push({ field: "Calories", from: String(before.calories), to: String(after.calories) });
      if (after.protein_g !== Number(before.protein_g)) changes.push({ field: "Protein", from: `${g(before.protein_g)} g`, to: `${g(after.protein_g)} g` });
      if (after.serving_amount !== Number(before.serving_amount) || after.serving_unit !== before.serving_unit)
        changes.push({ field: "Serving", from: `${g(before.serving_amount)} ${before.serving_unit}`, to: `${g(after.serving_amount)} ${after.serving_unit}` });
      if (after.aliases.join(",") !== before.aliases.join(",")) changes.push({ field: "Aliases", from: before.aliases.join(", ") || "–", to: after.aliases.join(", ") });
      return { status: "confirm", title: `Change ${before.name}?`, changes, tool: "apply_food_update", resolved: { id: before.id, ...after } };
    }
    const out = await rpc(db, "save_food", {
      p_name: r.name, p_aliases: r.aliases, p_serving_amount: r.serving_amount, p_serving_unit: r.serving_unit,
      p_calories: r.calories, p_protein_g: r.protein_g, p_tool: "save_food",
    });
    if (out?.status === "conflict") return { status: "failed", detail: `A food named "${r.name}" already exists.` };
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Food ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein ${perText(row.serving_amount, row.serving_unit)}`, actionId: out.action_id ?? null };
  },
};

/** Only reachable from the confirm card above. */
const applyFoodUpdate: ToolDef = {
  name: "apply_food_update",
  display: "Save food",
  async commit(r, db) {
    const out = await rpc(db, "update_food", {
      p_id: r.id, p_name: r.name, p_aliases: r.aliases, p_serving_amount: r.serving_amount, p_serving_unit: r.serving_unit,
      p_calories: r.calories, p_protein_g: r.protein_g, p_tool: "save_food",
    });
    if (out?.status === "conflict") return { status: "failed", detail: `A food named "${r.name}" already exists.` };
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Food ${row.name}: ${row.calories} cal, ${g(row.protein_g)} g protein ${perText(row.serving_amount, row.serving_unit)}`, actionId: out.action_id ?? null };
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
    // Applying to something on the "to apply" list checks that reminder off instead of adding a
    // second row. Looked up as soon as the position is known; used only if the status is Applied
    // (which may still be filled in on the missing-fields card).
    if (resolved.position) resolved.reminder_id = (await reminderFor(ctx.db, company, String(resolved.position)))?.id ?? null;
    const missing = missingAppFields(resolved);
    if (missing.length) return { status: "missing", resolved, title: `Application: ${company}`, missing };
    const existing = (await appsFor(ctx.db, company)).filter((a) => a.position.toLowerCase() === String(resolved.position).toLowerCase());
    const fields: [string, string][] = [["Company", company], ...appFields(resolved as unknown as AppRow)];
    if (resolved.reminder_id && resolved.status === "Applied") fields.push(["Reminder", "checked off"]);
    return {
      status: "ready",
      resolved,
      fields,
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
    if (typeof r.reminder_id === "string" && r.status === "Applied") {
      const done = await rpc(db, "apply_application_reminder", { p_id: r.reminder_id, p_date: r.applied_date, p_resume_name: r.resume_name, p_tool: "add_application" });
      if (done?.status === "saved" && done.row) {
        const row = done.row;
        return { status: "saved", label: `Application: ${row.company}, ${row.position} (${row.status}, ${fmtDay(String(row.applied_date))})`, actionId: done.action_id ?? null };
      }
      // The reminder was closed meanwhile: fall through and record it normally.
    }
    const out = await rpc(db, "save_application", {
      p_company: r.company, p_position: r.position, p_applied_date: r.applied_date, p_status: r.status, p_resume_name: r.resume_name, p_tool: "add_application",
    });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const row = out.row;
    return { status: "saved", label: `Application: ${row.company}, ${row.position} (${row.status}, ${fmtDay(String(row.applied_date))})`, actionId: out.action_id ?? null };
  },
};

async function reminderFor(db: Db, company: string, position: string) {
  const { data } = await db.from("open_application_reminders").select("id, company, position").ilike("company", company.trim()).ilike("position", position.trim());
  return data?.[0] ?? null;
}

const planApplication: ToolDef = {
  name: "plan_application",
  display: "To apply",
  definition: {
    name: "plan_application",
    description:
      "A job posting the owner saw and plans to apply to later, but hasn't yet, e.g. 'saw a Ramp SWE posting, apply later', " +
      "'remind me to apply to Stripe new grad'. Not for applications already sent (that's add_application).",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["company", "position", "confidence"],
      properties: {
        company: { type: "string" },
        position: { type: ["string", "null"], description: "Role as the owner wrote it. Null if not said." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    const company = String(input.company ?? "").trim();
    if (!company) return { status: "invalid", detail: "No company named." };
    const position = typeof input.position === "string" && input.position.trim() ? input.position.trim() : null;
    const resolved: Resolved = { company, position, date: ctx.today };
    if (!position) return { status: "missing", resolved, title: `Reminder: apply to ${company}`, missing: [{ name: "position", label: "Position", type: "text" }] };
    const applied = (await appsFor(ctx.db, company)).filter((a) => a.position.toLowerCase() === position.toLowerCase());
    return {
      status: "ready",
      resolved,
      fields: [["Apply to", company], ["Position", position]],
      warnings: applied.length ? [`You already applied to ${company} ${position} on ${fmtDay(applied[0].applied_date)}.`] : [],
    };
  },
  fill(r, values) {
    const v = String(values.position ?? "").trim();
    return v ? { ...r, position: v } : "Position is required.";
  },
  async commit(r, db) {
    const out = await rpc(db, "add_application_reminder", { p_company: r.company, p_position: r.position, p_date: r.date, p_tool: "plan_application" });
    if (out?.status === "conflict") return { status: "failed", detail: `${r.company} ${r.position} is already on your list.` };
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    return { status: "saved", label: `To apply: ${out.row.company}, ${out.row.position}`, actionId: out.action_id ?? null };
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

// ---- General reminders -----------------------------------------------------------------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A due date from the owner's own words, worked out by code (the model never computes
 * dates): "today", "tomorrow", "in 3 days", "friday" (the next one), "11/1", "Nov 1".
 * Anything else is null, never a guess.
 */
export function dueFrom(text: string | null, today: string): string | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/\btoday\b|\btonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  let m = t.match(/\bin\s+(\d+)\s+days?\b/);
  if (m) return addDays(today, Number(m[1]));
  m = t.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (m) return addDays(today, 7 * Number(m[1]));
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d.slice(0, 3)}(${d.slice(3)})?\\b`).test(t));
  if (wd >= 0) {
    const now = new Date(`${today}T12:00:00`).getDay();
    return addDays(today, ((wd - now + 7) % 7) || 7);
  }
  const year = Number(today.slice(0, 4));
  const iso = (mo: number, d: number) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const date = `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // A date already past this year means next year's.
    return date < today ? `${year + 1}${date.slice(4)}` : date;
  };
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return iso(Number(m[1]), Number(m[2]));
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (m) return iso(MONTH_NAMES.indexOf(m[1]) + 1, Number(m[2]));
  return null;
}

// "remind me to ...", "reminder: ..." prefixes. Everything after is the owner's text.
const REMIND_PREFIX = /^\s*(?:remind\s+me\s+(?:to\s+)?|reminder\s*[:\-–—]?\s*|don'?t\s+forget\s+(?:to\s+)?)/i;

const addReminder: ToolDef = {
  name: "add_reminder",
  display: "Reminder",
  definition: {
    name: "add_reminder",
    description:
      "Something the owner wants to be reminded of, e.g. 'remind me to call the landlord', 'renew passport by Nov 1'. " +
      "Not for job postings to apply to (that's plan_application), and not for logging something already done.",
    // Not strict: strict tools share a 16-nullable-field budget. Code re-checks every argument.
    strict: false,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["text", "due_text", "confidence"],
      properties: {
        text: { type: "string", description: "What to remember, copied exactly from the message, without 'remind me to' and without the due date." },
        due_text: { type: ["string", "null"], description: "The due date exactly as the owner wrote it ('tomorrow', 'friday', 'Nov 1'). Null if none." },
        confidence,
      },
    },
  },
  async check(input, ctx) {
    // The owner's own words: the model's span if it appears verbatim, else the message
    // minus a leading "remind me to".
    const m = ctx.text.match(REMIND_PREFIX);
    const body = verbatim(input.text, ctx.text) ?? (m ? ctx.text.slice(m[0].length) : ctx.text);
    if (!body.trim()) return { status: "invalid", detail: "The reminder is empty." };
    const dueText = verbatim(input.due_text, ctx.text);
    const due = dueFrom(dueText, ctx.today);
    const fields: [string, string][] = [["Reminder", body]];
    if (due) fields.push(["Due", fmtDay(due)]);
    else if (dueText) fields.push(["Due", `"${dueText}" (not read as a date)`]);
    return { status: "ready", resolved: { body, due, date: ctx.today }, fields, warnings: [] };
  },
  async commit(r, db) {
    const out = await rpc(db, "add_reminder", { p_body: r.body, p_due: r.due, p_date: r.date, p_tool: "add_reminder" });
    if (out?.status !== "saved" || !out.row) return { status: "failed" };
    const body = String(out.row.body);
    const short = body.length > 60 ? `${body.slice(0, 60)}…` : body;
    return { status: "saved", label: `Reminder: ${short}${out.row.due_date ? `, due ${fmtDay(String(out.row.due_date))}` : ""}`, actionId: out.action_id ?? null };
  },
};

const WRITE_TOOLS = [
  "log_weight", "log_saved_meal", "log_food", "log_leetcode", "add_note",
  "save_meal", "save_food", "add_application", "plan_application", "update_application", "log_callback", "log_run", "add_reminder",
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
    addReminder,
    logWeight, updateWeight, logRun, logSavedMeal, logFood, logLeetcode, addNote,
    saveMeal, updateMeal, saveFood, applyFoodUpdate, addApplication, planApplication, updateApplication, applyApplicationUpdate, logCallback,
  ].map((t) => [t.name, t]),
);

/**
 * The model's tool list, in a fixed order so the request prefix stays identical.
 * Strict tools together may declare at most 16 nullable/union fields (an API limit);
 * check this when adding a strict tool.
 */
export const MODEL_TOOLS: Anthropic.Tool[] = [...WRITE_TOOLS.map((n) => TOOLS[n].definition!), NO_MATCH];
