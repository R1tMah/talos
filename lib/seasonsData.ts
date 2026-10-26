"use client";

// Long Term: the owner's seasons and their dated updates, stored verbatim. Writes go
// through the database functions (actions row per write, so Undo works).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";

export interface SeasonNote { id: string; date: string | null; label: string | null; body: string }
export interface Season { id: string; position: number; name: string; plan: string; notes: SeasonNote[] }

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

/** Every season, newest (current) first; each season's notes in the order written. */
export function useSeasons() {
  const [rows, setRows] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [s, n] = await Promise.all([
      db.from("seasons").select("id, position, name, plan").is("deleted_at", null).order("position", { ascending: false }),
      db.from("season_notes").select("id, season_id, noted_on, label, body, position").is("deleted_at", null).order("position"),
    ]);
    if (s.error || n.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(s.data.map((x) => ({
      ...x,
      notes: n.data.filter((m) => m.season_id === x.id).map((m) => ({ id: m.id, date: m.noted_on, label: m.label, body: m.body })),
    })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  return out.status === "saved" || out.status === "not_found" ? { status: out.status } : { status: "failed" };
}

const orNull = (v: string | null) => v as string; // the functions take null; generated arg types don't say so

export const seasonsApi = {
  add: async (name: string, plan: string) => parse("seasons", await createClient().rpc("add_season", { p_name: name, p_plan: plan })),
  update: async (id: string, name: string, plan: string) =>
    parse("seasons", await createClient().rpc("update_season", { p_id: id, p_name: name, p_plan: plan })),
  addNote: async (seasonId: string, date: string, body: string) =>
    parse("season_notes", await createClient().rpc("add_season_note", { p_season_id: seasonId, p_date: date, p_label: orNull(null), p_body: body })),
  updateNote: async (n: SeasonNote, body: string) =>
    parse("season_notes", await createClient().rpc("update_season_note", { p_id: n.id, p_date: orNull(n.date), p_label: orNull(n.label), p_body: body })),
  removeNote: async (id: string) => parse("season_notes", await createClient().rpc("delete_season_note", { p_id: id })),
};
