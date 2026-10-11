"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { toHM } from "./date";

type Row = Database["public"]["Tables"]["applications"]["Row"];

export interface AppEntry {
  id: string;
  date: string;
  time: string; // entry time, for ordering within a day
  company: string;
  position: string;
  status: string;
  resume: string | null;
}

/** Status is free text in the database. These come first, in this order; anything else used follows. */
export const BASE_STATUSES = ["Applied", "OA Stage", "Interview", "Offer", "Rejected"];

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

const toEntry = (r: Row): AppEntry => ({
  id: r.id,
  date: r.applied_date,
  time: toHM(new Date(r.created_at)),
  company: r.company,
  position: r.position,
  status: r.status,
  resume: r.resume_name,
});

/** All live applications, newest first. Call `reload` after a write. */
export function useApplicationsData() {
  const [data, setData] = useState<AppEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient()
      .from("applications")
      .select("*")
      .is("deleted_at", null)
      .order("applied_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(res.data.map(toEntry));
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

export interface AppInput {
  company: string;
  position: string;
  date: string;
  status: string;
  resume: string | null;
}

// Generated arg types mark optional text args as `string`; null is what we mean by "none".
const orNull = (v: string | null) => (v || null) as string;

/** Writes go through the database functions, which also log an actions row. */
export const applicationsApi = {
  save: async (a: AppInput) =>
    parse("applications", 
      await createClient().rpc("save_application", {
        p_company: a.company, p_position: a.position, p_applied_date: a.date, p_status: a.status, p_resume_name: orNull(a.resume),
      }),
    ),
  update: async (id: string, a: AppInput) =>
    parse("applications", 
      await createClient().rpc("update_application", {
        p_id: id, p_company: a.company, p_position: a.position, p_applied_date: a.date, p_status: a.status,
        p_resume_name: orNull(a.resume),
      }),
    ),
  remove: async (id: string) => parse("applications", await createClient().rpc("delete_application", { p_id: id })),
};
