"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { toHM } from "./date";
import { announceWrite, useDataChanged } from "./undo";

export { fmtDuration, parseDuration } from "./duration";

type Row = Database["public"]["Tables"]["runs"]["Row"];

export interface Run {
  id: string;
  date: string;
  time: string; // entry time, for ordering within a day
  miles: number;
  seconds: number;
  calories: number | null; // estimate; null when there was no weigh-in to base it on
  weightUsed: number | null;
  note: string | null;
}

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

const toRun = (r: Row): Run => ({
  id: r.id,
  date: r.logical_date,
  time: toHM(new Date(r.created_at)),
  miles: Number(r.distance_mi),
  seconds: r.duration_sec,
  calories: r.calories_est,
  weightUsed: r.weight_lb_used == null ? null : Number(r.weight_lb_used),
  note: r.note,
});

/** Seconds per mile. */
export const paceOf = (r: Pick<Run, "miles" | "seconds">) => r.seconds / r.miles;

/** All live runs, newest first. Call `reload` after a write. */
export function useRuns() {
  const [data, setData] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("runs").select("*").is("deleted_at", null)
      .order("logical_date", { ascending: false }).order("created_at", { ascending: false });
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(res.data.map(toRun));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite("runs", out as { row?: Json; action_id?: string | null });
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

export interface RunInput {
  date: string;
  miles: number;
  seconds: number;
  note: string | null;
}

// Generated arg types mark optional text args as `string`; null is what we mean by "none".
const orNull = (v: string | null) => (v || null) as string;

/** Writes go through the database functions, which compute the calorie estimate and log an actions row. */
export const runsApi = {
  log: async (r: RunInput) =>
    parse(await createClient().rpc("log_run", { p_date: r.date, p_distance_mi: r.miles, p_duration_sec: r.seconds, p_note: orNull(r.note) })),
  update: async (id: string, r: RunInput) =>
    parse(await createClient().rpc("update_run", { p_id: id, p_date: r.date, p_distance_mi: r.miles, p_duration_sec: r.seconds, p_note: orNull(r.note) })),
  remove: async (id: string) => parse(await createClient().rpc("delete_run", { p_id: id })),
};
