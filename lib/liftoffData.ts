"use client";

// Lifts, client side: every saved Liftoff set (live rows), for the Lifts tab and its card.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { LiftSet } from "./liftoff";
import { useDataChanged } from "./undo";

const PAGE = 1000; // PostgREST returns at most this many rows per request

/** Every live set, oldest first; null when the read fails. The Lifts tab and Weight's export use it. */
export async function loadLiftSets(): Promise<LiftSet[] | null> {
  const db = createClient();
  const out: LiftSet[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("workout_log").select("*").is("deleted_at", null)
      .order("logical_date").order("started").order("set_order").range(from, from + PAGE - 1);
    if (error) return null;
    for (const r of data) {
      out.push({
        date: r.logical_date, started: r.started, duration: r.duration, workout: r.workout_name, exercise: r.exercise, order: r.set_order,
        weight: r.weight == null ? null : Number(r.weight), reps: r.reps, distance: r.distance == null ? null : Number(r.distance),
        seconds: r.seconds == null ? null : Number(r.seconds), rpe: r.rpe == null ? null : Number(r.rpe), notes: r.notes,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Every live set, oldest first. Reloads after any write anywhere (an import from chat included). */
export function useWorkoutLog() {
  const [sets, setSets] = useState<LiftSet[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const out = await loadLiftSets();
    if (!out) return setFailed(true);
    setFailed(false);
    setSets(out);
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { sets, failed, reload };
}

/** For the Lifts card: workouts this week (by session) and the latest one. Two small queries, not every set. */
export function useLiftsSummary(weekFrom: string) {
  const [v, setV] = useState<{ week: number; last: { workout: string; date: string } | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const db = createClient();
    const [week, last] = await Promise.all([
      db.from("workout_log").select("started, workout_name").is("deleted_at", null).gte("logical_date", weekFrom),
      db.from("workout_log").select("logical_date, workout_name").is("deleted_at", null).order("logical_date", { ascending: false }).order("started", { ascending: false }).limit(1),
    ]);
    if (week.error || last.error) return setFailed(true);
    setFailed(false);
    const n = new Set(week.data.map((r) => `${r.started}\u0000${r.workout_name}`)).size;
    setV({ week: n, last: last.data[0] ? { workout: last.data[0].workout_name, date: last.data[0].logical_date } : null });
  }, [weekFrom]);
  useDataChanged(load);
  useEffect(() => {
    load();
  }, [load]);
  return { data: v, failed };
}

/** How many of these workouts (by start time) are already imported: the preview's "replaces". */
export async function alreadyImported(starts: string[]): Promise<number | null> {
  if (!starts.length) return 0;
  const { data, error } = await createClient().from("workout_log").select("started").is("deleted_at", null).in("started", starts);
  return error ? null : new Set(data.map((r) => r.started)).size;
}

/** Saves parsed sets in one step; each workout replaces the same one already imported. */
export async function importSets(sets: LiftSet[]): Promise<{ ok: true; sessions: number; sets: number; replaced: number } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc("import_liftoff", { p_sets: sets as never, p_tool: "manual" });
  const out = data as { status?: string; sessions?: number; sets?: number; replaced?: number; detail?: string } | null;
  // Say what the database said: "The import failed" alone can't be acted on.
  if (error) return { ok: false, error: `The import failed, nothing was saved: ${error.message}` };
  if (out?.status !== "saved") return { ok: false, error: out?.detail ?? "The import failed. Nothing was saved." };
  return { ok: true, sessions: out.sessions ?? 0, sets: out.sets ?? 0, replaced: out.replaced ?? 0 };
}
