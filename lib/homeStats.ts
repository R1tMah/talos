"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { addDays, logicalToday, weekStart } from "./date";
import { countBy } from "./stats";
import { useDataChanged } from "./undo";

/**
 * Numbers for the Weight, Nutrition, LeetCode, Applications and Callbacks stat cards on the Tabs page.
 * Same sources as those tabs (latest weigh-in, weekly_weights, daily_totals,
 * targets_for, leetcode_counts, redo_queue) so the cards always match the tabs.
 */
export interface HomeStats {
  weight: {
    latest: number | null;
    thisWeek: { avg: number; n: number } | null;
    lastWeek: { avg: number; n: number } | null;
  };
  nutrition: { cal: number; p: number; calTarget: number; pTarget: number };
  /** Distinct problems this week and all time, days practiced this week, redo queue size. */
  leetcode: { week: number; days: number; redo: number; total: number };
  /** Live applications: total and count per status. */
  applications: { total: number; byStatus: Record<string, number> };
  /** Live callbacks per kind, from the callback_counts view: { OA: 3, Interview: 1 }. */
  callbacks: Record<string, number>;
  /** Live notepad entries per kind: count and latest logical date. */
  notes: Record<"personal" | "content" | "journal" | "talos", { n: number; last: string | null }>;
  /** Finished workouts this logical week, and the latest one. */
  lifts: { week: number; last: { plan: string; date: string } | null };
  /** Runs this logical week: count and miles; plus the latest run. */
  runs: { week: number; miles: number; last: { miles: number; seconds: number; date: string } | null };
}

export function useHomeStats() {
  const [data, setData] = useState<HomeStats | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped after an undo or redo anywhere, so the cards reload.
  const [tick, setTick] = useState(0);
  useDataChanged(useCallback(() => setTick((t) => t + 1), []));

  useEffect(() => {
    let live = true;
    const today = logicalToday();
    const thisWeek = weekStart(today);
    const lastWeek = addDays(thisWeek, -7);
    const db = createClient();

    Promise.all([
      db.from("weights").select("weight_lb").is("deleted_at", null)
        .order("logical_date", { ascending: false }).order("created_at", { ascending: false }).limit(1),
      db.from("weekly_weights").select("*").in("week_start", [thisWeek, lastWeek]),
      db.from("daily_totals").select("*").eq("logical_date", today).maybeSingle(),
      db.rpc("targets_for", { p_date: today }).single(),
      db.rpc("leetcode_counts", { p_from: thisWeek, p_to: today }),
      db.rpc("leetcode_counts", { p_from: "2000-01-01", p_to: today }),
      db.from("redo_queue").select("id", { count: "exact", head: true }),
      db.from("applications").select("status").is("deleted_at", null),
      db.from("callback_counts").select("*"),
      db.from("notes").select("kind, logical_date").is("deleted_at", null),
      db.from("workout_history").select("logical_date, plan_name").eq("status", "done")
        .order("logical_date", { ascending: false }).order("started_at", { ascending: false }).limit(30),
      db.from("runs").select("logical_date, distance_mi, duration_sec").is("deleted_at", null)
        .order("logical_date", { ascending: false }).order("created_at", { ascending: false }).limit(30),
    ]).then(([w, wk, day, targets, lcWeek, lcAll, redo, apps, cbs, notes, lifts, runs]) => {
      if (!live) return;
      if (w.error || wk.error || day.error || targets.error || lcWeek.error || lcAll.error || redo.error || apps.error || cbs.error || notes.error || lifts.error || runs.error) {
        setFailed(true);
        return;
      }
      const week = (start: string) => {
        const r = wk.data.find((x) => x.week_start === start);
        return r ? { avg: Number(r.avg_lb), n: Number(r.n) } : null;
      };
      const count = (rows: { dimension: string; n: number }[], dim: string) => rows.find((r) => r.dimension === dim)?.n ?? 0;
      const pad = (rows: { kind: string; logical_date: string }[], kind: string) => {
        const dates = rows.filter((r) => r.kind === kind).map((r) => r.logical_date).sort();
        return { n: dates.length, last: dates.at(-1) ?? null };
      };
      setFailed(false);
      setData({
        weight: {
          latest: w.data[0] ? Number(w.data[0].weight_lb) : null,
          thisWeek: week(thisWeek),
          lastWeek: week(lastWeek),
        },
        nutrition: {
          cal: day.data?.calories ?? 0,
          p: Number(day.data?.protein_g ?? 0),
          calTarget: targets.data.calorie_target,
          pTarget: targets.data.protein_target_g,
        },
        leetcode: {
          week: count(lcWeek.data, "problems"),
          days: count(lcWeek.data, "days"),
          redo: redo.count ?? 0,
          total: count(lcAll.data, "problems"),
        },
        applications: { total: apps.data.length, byStatus: countBy(apps.data, (a) => a.status) },
        callbacks: Object.fromEntries(cbs.data.map((c) => [c.kind ?? "", c.n ?? 0])),
        notes: {
          content: pad(notes.data, "content"),
          journal: pad(notes.data, "journal"),
          personal: pad(notes.data, "personal"),
          talos: pad(notes.data, "talos"),
        },
        runs: (() => {
          const week = runs.data.filter((r) => r.logical_date >= thisWeek && r.logical_date <= today);
          const r0 = runs.data[0];
          return {
            week: week.length,
            miles: Math.round(week.reduce((a, r) => a + Number(r.distance_mi), 0) * 100) / 100,
            last: r0 ? { miles: Number(r0.distance_mi), seconds: r0.duration_sec, date: r0.logical_date } : null,
          };
        })(),
        lifts: {
          week: lifts.data.filter((l) => l.logical_date! >= thisWeek && l.logical_date! <= today).length,
          last: lifts.data[0] ? { plan: lifts.data[0].plan_name ?? "Workout", date: lifts.data[0].logical_date! } : null,
        },
      });
    });

    return () => {
      live = false;
    };
  }, [tick]);

  return { data, failed };
}
