"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { toHM } from "./date";

type Tables = Database["public"]["Tables"];
type MealRow = Tables["saved_meals"]["Row"];

export type FoodSource = "typed" | "saved_meal" | "photo_estimate";

export interface LogEntry {
  id: string;
  date: string;
  time: string;
  name: string;
  cal: number;
  p: number;
  source: FoodSource;
  /** Portion count and unit, set for saved-meal entries. */
  portions: number | null;
  unit: string | null;
}

/** A food in the library, per serving. */
export interface Food {
  id: string;
  name: string;
  aliases: string[];
  amount: number;
  unit: string;
  cal: number;
  p: number;
}

/** One ingredient of a saved meal: servings of a food per meal portion. */
export interface MealItem {
  foodId: string;
  servings: number;
}

/**
 * One portion of a saved meal. `cal`/`p` are the meal's own totals; `items` are
 * optional ingredient tags, used to show the breakdown and to subtract at log time.
 */
export interface Meal {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  cal: number;
  p: number;
  /** Price per portion in dollars. When set, logging the meal also logs spending. */
  price: number | null;
  items: MealItem[];
}

/** A logged day from the daily_totals view, with that day's targets. */
export interface DayTotal {
  date: string;
  cal: number;
  p: number;
  entries: number;
  calTarget: number;
  pTarget: number;
}

export interface NutritionData {
  entries: LogEntry[]; // the selected day, newest first
  days: DayTotal[]; // every logged day, newest first
  targets: { cal: number; p: number }; // for the selected day, even with no entries
  meals: Meal[];
  foods: Food[]; // live foods, by name
}

export type WriteResult =
  | { status: "saved" }
  | { status: "conflict"; kind: "meal" | "food"; name: string }
  | { status: "in_use"; meals: string[] }
  | { status: "not_found" }
  | { status: "failed" };

const num = (v: number | null) => (v == null ? null : Number(v));

const toEntry = (r: Tables["food_log"]["Row"]): LogEntry => ({
  id: r.id,
  date: r.logical_date,
  time: toHM(new Date(r.created_at)),
  name: r.description,
  cal: r.calories,
  p: Number(r.protein_g),
  source: r.source as FoodSource,
  portions: num(r.amount),
  unit: r.unit,
});

const toMeal = (r: MealRow, items: MealItem[] = []): Meal => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases,
  unit: r.portion_unit,
  cal: r.calories,
  p: Number(r.protein_g),
  price: num(r.price),
  items,
});

const toFood = (r: Tables["foods"]["Row"]): Food => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases,
  amount: Number(r.serving_amount),
  unit: r.serving_unit,
  cal: r.calories,
  p: Number(r.protein_g),
});

/** Loads the selected day plus everything around it. Call `reload` after a write. */
export function useNutritionData(date: string) {
  const [data, setData] = useState<NutritionData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [log, days, targets, meals, foods, items] = await Promise.all([
      db.from("food_log").select("*").eq("logical_date", date).is("deleted_at", null).order("created_at", { ascending: false }),
      db.from("daily_totals").select("*"),
      db.rpc("targets_for", { p_date: date }).single(),
      db.from("saved_meals").select("*").is("deleted_at", null).order("name"),
      db.from("foods").select("*").is("deleted_at", null).order("name"),
      db.from("saved_meal_items").select("saved_meal_id, food_id, servings").is("deleted_at", null).order("created_at"),
    ]);
    if (log.error || days.error || targets.error || meals.error || foods.error || items.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      entries: log.data.map(toEntry),
      days: days.data.map((r) => ({
        date: r.logical_date!,
        cal: r.calories ?? 0,
        p: Number(r.protein_g ?? 0),
        entries: r.entries ?? 0,
        calTarget: r.calorie_target ?? 0,
        pTarget: r.protein_target_g ?? 0,
      })),
      targets: { cal: targets.data.calorie_target, p: targets.data.protein_target_g },
      meals: meals.data.map((m) =>
        toMeal(
          m,
          items.data.filter((i) => i.saved_meal_id === m.id).map((i) => ({ foodId: i.food_id, servings: Number(i.servings) })),
        ),
      ),
      foods: foods.data.map(toFood),
    });
  }, [date]);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; existing?: { name: string }; meals?: string[] } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "conflict" && out.existing)
    return { status: "conflict", kind: table === "foods" ? "food" : "meal", name: out.existing.name };
  if (out.status === "in_use") return { status: "in_use", meals: out.meals ?? [] };
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

// Carbs and fat aren't tracked. The update functions still take them, so pass null;
// generated arg types don't mark it as allowed.
const untracked = null as unknown as number;

export interface Macros {
  cal: number;
  p: number;
}

export interface MealInput extends Macros {
  name: string;
  aliases: string[];
  unit: string;
  /** Dollars per portion, or null for none. */
  price: number | null;
}

export interface FoodInput extends Macros {
  name: string;
  aliases: string[];
  amount: number;
  unit: string;
}

// Null clears a meal's price; generated arg types don't mark it as allowed.
const priceArg = (v: number | null) => v as number;

const itemsJson = (items: MealItem[]) => items.map((i) => ({ food_id: i.foodId, servings: i.servings }));

/** Writes go through the database functions, which do all macro math and log an actions row. */
export const nutritionApi = {
  logTyped: async (date: string, name: string, m: Macros) =>
    parse("food_log", 
      await createClient().rpc("log_food", {
        p_date: date, p_description: name, p_calories: m.cal, p_protein_g: m.p,
      }),
    ),
  /**
   * `minus`: servings of the meal's own ingredients to leave out of this log, per portion.
   * A priced meal also logs Food & drink spending (price × portions), linked to this entry.
   */
  logMeal: async (date: string, mealId: string, portions: number, minus: MealItem[] = []) =>
    parse(
      "food_log",
      await createClient().rpc("log_saved_meal", { p_date: date, p_meal_id: mealId, p_portions: portions, p_minus: itemsJson(minus) }),
    ),
  /** A food from the library: its macros × servings, copied into one entry. */
  logFood: async (date: string, foodId: string, servings: number) =>
    parse("food_log", await createClient().rpc("log_food_item", { p_date: date, p_food_id: foodId, p_servings: servings })),
  updateTyped: async (id: string, date: string, name: string, m: Macros) =>
    parse("food_log", 
      await createClient().rpc("update_food_entry", {
        p_id: id, p_date: date, p_description: name, p_calories: m.cal, p_protein_g: m.p, p_carbs_g: untracked, p_fat_g: untracked,
      }),
    ),
  setPortions: async (id: string, date: string, portions: number) =>
    parse("food_log", await createClient().rpc("set_food_portions", { p_id: id, p_date: date, p_portions: portions })),
  removeEntry: async (id: string) => parse("food_log", await createClient().rpc("delete_food_entry", { p_id: id })),

  saveMeal: async (m: MealInput) =>
    parse("saved_meals", 
      await createClient().rpc("save_meal", {
        p_name: m.name, p_aliases: m.aliases, p_portion_unit: m.unit, p_calories: m.cal, p_protein_g: m.p, p_price: priceArg(m.price),
      }),
    ),
  updateMeal: async (id: string, m: MealInput) =>
    parse("saved_meals", 
      await createClient().rpc("update_meal", {
        p_id: id, p_name: m.name, p_aliases: m.aliases, p_portion_unit: m.unit,
        p_calories: m.cal, p_protein_g: m.p, p_carbs_g: untracked, p_fat_g: untracked, p_price: priceArg(m.price),
      }),
    ),
  removeMeal: async (id: string) => parse("saved_meals", await createClient().rpc("delete_meal", { p_id: id })),
  /** Replaces the meal's ingredient list. Never changes the meal's own totals. */
  setMealItems: async (mealId: string, items: MealItem[]) =>
    parse("saved_meal_items", await createClient().rpc("set_meal_items", { p_meal_id: mealId, p_items: itemsJson(items) })),

  saveFood: async (f: FoodInput) =>
    parse(
      "foods",
      await createClient().rpc("save_food", {
        p_name: f.name, p_aliases: f.aliases, p_serving_amount: f.amount, p_serving_unit: f.unit, p_calories: f.cal, p_protein_g: f.p,
      }),
    ),
  updateFood: async (id: string, f: FoodInput) =>
    parse(
      "foods",
      await createClient().rpc("update_food", {
        p_id: id, p_name: f.name, p_aliases: f.aliases, p_serving_amount: f.amount, p_serving_unit: f.unit, p_calories: f.cal, p_protein_g: f.p,
      }),
    ),
  /** Refused with `in_use` while a saved meal lists the food. */
  removeFood: async (id: string) => parse("foods", await createClient().rpc("delete_food", { p_id: id })),
};
