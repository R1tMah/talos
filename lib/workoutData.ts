"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { setWorkoutStarted } from "./workoutClock";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
}

export interface Plan {
  id: string;
  name: string;
  exercises: Exercise[]; // in plan order
}

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  reps: number;
  weight: number | null; // null = bodyweight
  variant: string | null;
}

export interface Active {
  id: string;
  planId: string | null;
  planName: string | null;
  date: string;
  startedAt: number;
  sets: LoggedSet[];
}

export interface HistoryRow {
  id: string;
  date: string;
  planName: string | null;
  sets: number;
  minutes: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** One lift on one day, from the lift_daily view. */
export interface LiftDay {
  exerciseId: string;
  date: string;
  sets: number;
  e1rm: number | null; // Epley estimate from the day's best set; null for bodyweight
  bestWeight: number | null;
  bestReps: number;
  maxReps: number;
  volume: number;
}

export interface WorkoutData {
  exercises: Exercise[];
  plans: Plan[];
  active: Active | null;
  history: HistoryRow[]; // finished workouts, newest first
  restSeconds: number;
  /** The most recent day's best set per exercise, for prefilling the entry form. */
  lastBest: Record<string, { weight: number | null; reps: number }>;
}

/** Exercises whose sets record the machine used. */
export const VARIANTS: Record<string, string[]> = { "Chest fly": ["cable", "machine"], Row: ["cable", "machine"] };

const num = (v: number | null) => (v == null ? null : Number(v));

export const toLiftDay = (r: Views["lift_daily"]["Row"]): LiftDay => ({
  exerciseId: r.exercise_id!,
  date: r.logical_date!,
  sets: r.sets ?? 0,
  e1rm: num(r.e1rm),
  bestWeight: num(r.best_weight),
  bestReps: r.best_reps ?? 0,
  maxReps: r.max_reps ?? 0,
  volume: Number(r.volume ?? 0),
});

const toSet = (s: Tables["sets"]["Row"]): LoggedSet => ({
  id: s.id, exerciseId: s.exercise_id, setNumber: s.set_number, reps: s.reps, weight: num(s.weight_lb), variant: s.variant,
});

export function useWorkoutData() {
  const [data, setData] = useState<WorkoutData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [ex, plans, active, history, settings, days] = await Promise.all([
      db.from("exercises").select("id, name, aliases").is("deleted_at", null).order("name"),
      db.from("plans").select("id, name, plan_exercises(position, exercise_id, deleted_at)").is("deleted_at", null).order("name"),
      db.from("workouts").select("*, plans(name)").eq("status", "active").is("deleted_at", null).maybeSingle(),
      db.from("workout_history").select("*").eq("status", "done").order("logical_date", { ascending: false })
        .order("started_at", { ascending: false }).limit(200),
      db.from("settings").select("rest_seconds").eq("id", 1).single(),
      db.from("lift_daily").select("*").order("logical_date", { ascending: false }),
    ]);
    if (ex.error || plans.error || active.error || history.error || settings.error || days.error) {
      setFailed(true);
      return;
    }
    const exercises = ex.data;
    const byId = new Map(exercises.map((e) => [e.id, e]));

    let activeOut: Active | null = null;
    if (active.data) {
      const sets = await db.from("sets").select("*").eq("workout_id", active.data.id).is("deleted_at", null).order("created_at");
      if (sets.error) {
        setFailed(true);
        return;
      }
      activeOut = {
        id: active.data.id,
        planId: active.data.plan_id,
        planName: (active.data.plans as { name: string } | null)?.name ?? null,
        date: active.data.logical_date,
        startedAt: new Date(active.data.started_at).getTime(),
        sets: sets.data.map(toSet),
      };
    }
    // Keep the device's clock (tab bar, rest timer) in step with the database.
    setWorkoutStarted(activeOut?.startedAt ?? null);

    const lastBest: WorkoutData["lastBest"] = {};
    for (const d of days.data) {
      if (d.exercise_id && !lastBest[d.exercise_id]) lastBest[d.exercise_id] = { weight: num(d.best_weight), reps: d.best_reps ?? 0 };
    }

    setFailed(false);
    setData({
      exercises,
      plans: plans.data.map((p) => ({
        id: p.id,
        name: p.name,
        exercises: (p.plan_exercises ?? [])
          .filter((pe) => !pe.deleted_at)
          .sort((a, b) => a.position - b.position)
          .map((pe) => byId.get(pe.exercise_id))
          .filter((e): e is Exercise => !!e),
      })),
      active: activeOut,
      history: history.data.map((h) => ({
        id: h.id!, date: h.logical_date!, planName: h.plan_name, sets: h.sets ?? 0, minutes: h.minutes, startedAt: h.started_at!, endedAt: h.ended_at,
      })),
      restSeconds: settings.data.rest_seconds,
      lastBest,
    });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

/** Every exercise's daily numbers, for the progression chart. */
export function useLiftDays() {
  const [data, setData] = useState<{ exercises: Exercise[]; days: LiftDay[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [ex, days] = await Promise.all([
      db.from("exercises").select("id, name, aliases").is("deleted_at", null).order("name"),
      db.from("lift_daily").select("*").order("logical_date"),
    ]);
    if (ex.error || days.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({ exercises: ex.data, days: days.data.map(toLiftDay) });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

export type WriteResult = { status: "saved"; row?: Record<string, unknown> } | { status: "conflict"; existing?: Record<string, unknown> } | { status: "not_found" } | { status: "failed" };

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; row?: Record<string, unknown>; existing?: Record<string, unknown> } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved") return { status: "saved", row: out.row };
  if (out.status === "conflict") return { status: "conflict", existing: out.existing };
  if (out.status === "not_found") return { status: "not_found" };
  return { status: "failed" };
}

// The functions accept null (empty workout, bodyweight set); generated arg types don't say so.
const n = <T,>(v: T | null) => v as T;

/** Writes go through the database functions, which also log an actions row (Undo). */
export const workoutApi = {
  start: async (planId: string | null, date: string) =>
    parse("workouts", await createClient().rpc("start_workout", { p_plan_id: n(planId), p_date: date })),
  logSet: async (workoutId: string, exerciseId: string, reps: number, weight: number | null, variant: string | null) =>
    parse("sets", await createClient().rpc("log_set", { p_workout_id: workoutId, p_exercise_id: exerciseId, p_reps: reps, p_weight_lb: n(weight), p_variant: n(variant) })),
  updateSet: async (id: string, reps: number, weight: number | null, variant: string | null) =>
    parse("sets", await createClient().rpc("update_set", { p_id: id, p_reps: reps, p_weight_lb: n(weight), p_variant: n(variant) })),
  deleteSet: async (id: string) => parse("sets", await createClient().rpc("delete_set", { p_id: id })),
  /** Done, or an edit of a finished workout's date and times. */
  update: async (id: string, date: string, startedAt: string, endedAt: string | null, status: "active" | "done") =>
    parse("workouts", await createClient().rpc("update_workout", { p_id: id, p_date: date, p_started_at: startedAt, p_ended_at: n(endedAt), p_status: status })),
  remove: async (id: string) => parse("workouts", await createClient().rpc("delete_workout", { p_id: id })),
  addExercise: async (name: string, aliases: string[] = []) =>
    parse("exercises", await createClient().rpc("add_exercise", { p_name: name, p_aliases: aliases })),
};
