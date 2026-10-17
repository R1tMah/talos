"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { logicalToday } from "./date";
import { FLAGS } from "./flags";
import { dataChanged, useDataChanged } from "./undo";

export interface SettingsData {
  /** Today's targets: from the phase covering today, else the settings fallback. */
  targets: { calories: number; protein: number };
  restSeconds: number;
  contextBlurb: string;
  confidence: number;
  timezone: string;
  savedMeals: number;
  plans: { name: string; exercises: string[] }[]; // only loaded when FLAGS.workout
}

export type SettingsResult = { status: "saved" } | { status: "unchanged" } | { status: "invalid"; detail: string } | { status: "failed" };

export function useSettings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [s, t, meals, plans] = await Promise.all([
      db.from("settings").select("*").eq("id", 1).single(),
      db.rpc("targets_for", { p_date: logicalToday() }).single(),
      db.from("saved_meals").select("id", { count: "exact", head: true }).is("deleted_at", null),
      FLAGS.workout
        ? db.from("plans").select("name, plan_exercises(position, deleted_at, exercises(name))").is("deleted_at", null).order("name")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (s.error || t.error || meals.error || plans.error) {
      setFailed(true);
      return;
    }
    type PlanRow = { name: string; plan_exercises: { position: number; deleted_at: string | null; exercises: { name: string } | null }[] };
    setFailed(false);
    setData({
      targets: { calories: t.data.calorie_target, protein: t.data.protein_target_g },
      restSeconds: s.data.rest_seconds,
      contextBlurb: s.data.context_blurb ?? "",
      confidence: Number(s.data.confidence_threshold),
      timezone: s.data.timezone,
      savedMeals: meals.count ?? 0,
      plans: ((plans.data ?? []) as unknown as PlanRow[]).map((p) => ({
        name: p.name,
        exercises: p.plan_exercises
          .filter((pe) => !pe.deleted_at && pe.exercises)
          .sort((a, b) => a.position - b.position)
          .map((pe) => pe.exercises!.name),
      })),
    });
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): SettingsResult {
  const out = res.data as { status?: string; detail?: string } | null;
  if (res.error || !out) return { status: "failed" };
  if (out.status === "saved") {
    dataChanged(); // targets feed Nutrition and the Tabs cards
    return { status: "saved" };
  }
  if (out.status === "unchanged") return { status: "unchanged" };
  if (out.status === "invalid") return { status: "invalid", detail: out.detail ?? "Invalid" };
  return { status: "failed" };
}

export interface SettingsChanges {
  rest_seconds?: number;
  context_blurb?: string;
  confidence_threshold?: number;
  timezone?: string;
}

export const settingsApi = {
  /** New targets from today on: starts a new phase today (past days keep theirs). */
  setTargets: async (calories: number, protein: number) =>
    parse(await createClient().rpc("set_targets", { p_date: logicalToday(), p_calories: calories, p_protein_g: protein })),
  update: async (changes: SettingsChanges) => parse(await createClient().rpc("update_settings", { p_changes: changes as Json })),
};
