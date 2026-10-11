"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";

type Row = Database["public"]["Tables"]["callbacks"]["Row"];

export const CALLBACK_KINDS = ["OA", "Interview", "Recruiter"];

export interface Callback {
  id: string;
  date: string | null; // some imported callbacks have no known date
  company: string;
  kind: string;
  score: string | null;
  outcome: string | null;
  debrief: string; // verbatim; empty string when none
  linked: boolean; // tied to an application
}

export type WriteResult =
  | { status: "saved"; hasApplication?: boolean }
  | { status: "not_found" }
  | { status: "failed" };

const toCallback = (r: Row): Callback => ({
  id: r.id,
  date: r.logical_date,
  company: r.company,
  kind: r.kind,
  score: r.score,
  outcome: r.outcome,
  debrief: r.debrief ?? "",
  linked: r.application_id != null,
});

/** Every callback (dated newest first, undated last) plus the per-kind counts. */
export function useCallbacks() {
  const [data, setData] = useState<{ rows: Callback[]; counts: Record<string, number> } | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [rows, counts] = await Promise.all([
      db.from("callbacks").select("*").is("deleted_at", null)
        .order("logical_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      db.from("callback_counts").select("*"),
    ]);
    if (rows.error || counts.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      rows: rows.data.map(toCallback),
      counts: Object.fromEntries(counts.data.map((c) => [c.kind ?? "", c.n ?? 0])),
    });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

/** One callback, for the debrief screen. `missing` once loaded and not found. */
export function useCallbackRow(id: string) {
  const [row, setRow] = useState<Callback | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  const reload = useCallback(async () => {
    const { data, error } = await createClient().from("callbacks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) return setState("failed");
    setRow(data ? toCallback(data) : null);
    setState(data ? "ready" : "missing");
  }, [id]);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { row, state, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; has_application?: boolean } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved") return { status: "saved", hasApplication: out.has_application };
  if (out.status === "not_found") return { status: "not_found" };
  return { status: "failed" };
}

export interface CallbackInput {
  date: string | null;
  company: string;
  kind: string;
  score: string | null;
  outcome: string | null;
}

// The functions accept null for empty fields; generated arg types don't mark it.
const n = <T,>(v: T | null) => v as T;

/** Writes go through the database functions, which also log an actions row. */
export const callbacksApi = {
  log: async (c: CallbackInput) =>
    parse("callbacks", 
      await createClient().rpc("log_callback", {
        p_date: n(c.date), p_company: c.company, p_kind: c.kind, p_score: n(c.score), p_outcome: n(c.outcome),
      }),
    ),
  update: async (id: string, c: CallbackInput) =>
    parse("callbacks", 
      await createClient().rpc("update_callback", {
        p_id: id, p_date: n(c.date), p_company: c.company, p_kind: c.kind, p_score: n(c.score), p_outcome: n(c.outcome),
      }),
    ),
  /** Saved exactly as given. Unchanged text is a no-op in the database. */
  setDebrief: async (id: string, debrief: string) => parse("callbacks", await createClient().rpc("set_debrief", { p_id: id, p_debrief: debrief })),
  remove: async (id: string) => parse("callbacks", await createClient().rpc("delete_callback", { p_id: id })),
};
