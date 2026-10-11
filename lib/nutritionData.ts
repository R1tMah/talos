"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
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

/** One portion of a saved meal. */
export interface Meal {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  cal: number;
  p: number;
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
}

export type WriteResult =
  | { status: "saved" }
  | { status: "conflict"; existing: Meal }
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

const toMeal = (r: MealRow): Meal => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases,
  unit: r.portion_unit,
  cal: r.calories,
  p: Number(r.protein_g),
});

/** Loads the selected day plus everything around it. Call `reload` after a write. */
export function useNutritionData(date: string) {
  const [data, setData] = useState<NutritionData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [log, days, targets, meals] = await Promise.all([
      db.from("food_log").select("*").eq("logical_date", date).is("deleted_at", null).order("created_at", { ascending: false }),
      db.from("daily_totals").select("*"),
      db.rpc("targets_for", { p_date: date }).single(),
      db.from("saved_meals").select("*").is("deleted_at", null).order("name"),
    ]);
    if (log.error || days.error || targets.error || meals.error) {
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
      meals: meals.data.map(toMeal),
    });
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; existing?: MealRow } | null;
  if (res.error || !out) return { status: "failed" };
  if (out.status === "conflict" && out.existing) return { status: "conflict", existing: toMeal(out.existing) };
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
}

/** Writes go through the database functions, which do all macro math and log an actions row. */
export const nutritionApi = {
  logTyped: async (date: string, name: string, m: Macros) =>
    parse(
      await createClient().rpc("log_food", {
        p_date: date, p_description: name, p_calories: m.cal, p_protein_g: m.p,
      }),
    ),
  logMeal: async (date: string, mealId: string, portions: number) =>
    parse(await createClient().rpc("log_saved_meal", { p_date: date, p_meal_id: mealId, p_portions: portions })),
  updateTyped: async (id: string, date: string, name: string, m: Macros) =>
    parse(
      await createClient().rpc("update_food_entry", {
        p_id: id, p_date: date, p_description: name, p_calories: m.cal, p_protein_g: m.p, p_carbs_g: untracked, p_fat_g: untracked,
      }),
    ),
  setPortions: async (id: string, date: string, portions: number) =>
    parse(await createClient().rpc("set_food_portions", { p_id: id, p_date: date, p_portions: portions })),
  removeEntry: async (id: string) => parse(await createClient().rpc("delete_food_entry", { p_id: id })),

  saveMeal: async (m: MealInput) =>
    parse(
      await createClient().rpc("save_meal", {
        p_name: m.name, p_aliases: m.aliases, p_portion_unit: m.unit, p_calories: m.cal, p_protein_g: m.p,
      }),
    ),
  updateMeal: async (id: string, m: MealInput) =>
    parse(
      await createClient().rpc("update_meal", {
        p_id: id, p_name: m.name, p_aliases: m.aliases, p_portion_unit: m.unit,
        p_calories: m.cal, p_protein_g: m.p, p_carbs_g: untracked, p_fat_g: untracked,
      }),
    ),
  removeMeal: async (id: string) => parse(await createClient().rpc("delete_meal", { p_id: id })),
};
