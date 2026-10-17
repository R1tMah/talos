"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { toHM } from "./date";

export type NoteKind = "content" | "journal";

export interface NoteEntry {
  id: string;
  date: string;
  time: string; // entry time, for display and ordering
  body: string; // verbatim
}

export type WriteResult = { status: "saved"; id?: string } | { status: "not_found" } | { status: "failed" };

/** Entries of one kind, newest first. Call `reload` after a write. */
export function useNotes(kind: NoteKind) {
  const [rows, setRows] = useState<NoteEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await createClient()
      .from("notes").select("*").eq("kind", kind).is("deleted_at", null)
      .order("logical_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data.map((r) => ({ id: r.id, date: r.logical_date, time: toHM(new Date(r.created_at)), body: r.body })));
  }, [kind]);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; row?: { id: string } } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved") return { status: "saved", id: out.row?.id };
  if (out.status === "not_found") return { status: "not_found" };
  return { status: "failed" };
}

/** Bodies are saved exactly as given; the database functions also log an actions row. */
export const notesApi = {
  /** "weight" notes live in the Weight tab's log, not a notepad screen. */
  add: async (kind: NoteKind | "weight", date: string, body: string) =>
    parse("notes", await createClient().rpc("add_note", { p_kind: kind, p_date: date, p_body: body })),
  setBody: async (id: string, body: string) => parse("notes", await createClient().rpc("set_note_body", { p_id: id, p_body: body })),
  remove: async (id: string) => parse("notes", await createClient().rpc("delete_note", { p_id: id })),
};
