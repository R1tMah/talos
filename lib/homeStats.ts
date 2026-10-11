"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { addDays, logicalToday, weekStart } from "./date";

/**
 * Numbers for the Weight and Nutrition stat cards on the Tabs page. Same
 * sources as those tabs (latest weigh-in, weekly_weights, daily_totals,
 * targets_for) so the cards always match what the tabs show.
 */
export interface HomeStats {
  weight: {
    latest: number | null;
    thisWeek: { avg: number; n: number } | null;
    lastWeek: { avg: number; n: number } | null;
  };
  nutrition: { cal: number; p: number; calTarget: number; pTarget: number };
}

export function useHomeStats() {
  const [data, setData] = useState<HomeStats | null>(null);
  const [failed, setFailed] = useState(false);

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
    ]).then(([w, wk, day, targets]) => {
      if (!live) return;
      if (w.error || wk.error || day.error || targets.error) {
        setFailed(true);
        return;
      }
      const week = (start: string) => {
        const r = wk.data.find((x) => x.week_start === start);
        return r ? { avg: Number(r.avg_lb), n: Number(r.n) } : null;
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
      });
    });

    return () => {
      live = false;
    };
  }, []);

  return { data, failed };
}
