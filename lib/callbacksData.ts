"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";

type Row = Database["public"]["Tables"]["callbacks"]["Row"];
type UpdateRow = Database["public"]["Tables"]["callback_updates"]["Row"];

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

/** One update in a callback's thread. `deleted` ones are kept only to hold their replies. */
export interface CallbackUpdate {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
}

/** An update with its replies, oldest first at every level. */
export interface UpdateNode extends CallbackUpdate {
  replies: UpdateNode[];
  /** Live updates in this subtree, itself included. */
  count: number;
}

/** Per callback: how many live updates, and the newest one. */
export interface ThreadSummary {
  count: number;
  latest: { body: string; createdAt: string } | null;
}

const toUpdate = (r: UpdateRow): CallbackUpdate => ({
  id: r.id,
  parentId: r.parent_id,
  body: r.body,
  createdAt: r.created_at,
  edited: r.edited_at != null,
  deleted: r.deleted_at != null,
});

/**
 * Builds the reply tree. A deleted update stays only while something live hangs under
 * it (shown as "[deleted]"); a reply whose parent is missing goes to the top level.
 */
export function buildTree(updates: CallbackUpdate[]): UpdateNode[] {
  const sorted = [...updates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodes = new Map(sorted.map((u) => [u.id, { ...u, replies: [] as UpdateNode[], count: 0 }]));
  const roots: UpdateNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ? parent.replies : roots).push(n);
  }
  const prune = (list: UpdateNode[]): UpdateNode[] =>
    list.filter((n) => {
      n.replies = prune(n.replies);
      n.count = (n.deleted ? 0 : 1) + n.replies.reduce((t, r) => t + r.count, 0);
      return n.count > 0;
    });
  return prune(roots);
}

/** Every callback (dated newest first, undated last) plus the per-kind counts. */
export function useCallbacks() {
  const [data, setData] = useState<{
    rows: Callback[];
    counts: Record<string, number>;
    threads: Record<string, ThreadSummary>;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [rows, counts, updates] = await Promise.all([
      db.from("callbacks").select("*").is("deleted_at", null)
        .order("logical_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      db.from("callback_counts").select("*"),
      db.from("callback_updates").select("callback_id, body, created_at").is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);
    if (rows.error || counts.error || updates.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      rows: rows.data.map(toCallback),
      counts: Object.fromEntries(counts.data.map((c) => [c.kind ?? "", c.n ?? 0])),
      threads: summarize(updates.data),
    });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

/** Newest first in, so the first one seen per callback is its latest. */
function summarize(rows: { callback_id: string; body: string; created_at: string }[]) {
  const out: Record<string, ThreadSummary> = {};
  for (const r of rows) {
    const t = (out[r.callback_id] ??= { count: 0, latest: { body: r.body, createdAt: r.created_at } });
    t.count += 1;
  }
  return out;
}

/** Every update in one callback's thread, deleted ones included (see buildTree). */
export function useCallbackThread(callbackId: string) {
  const [updates, setUpdates] = useState<CallbackUpdate[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await createClient().from("callback_updates").select("*")
      .eq("callback_id", callbackId).order("created_at", { ascending: true });
    if (error) return setFailed(true);
    setFailed(false);
    setUpdates(data.map(toUpdate));
  }, [callbackId]);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { updates, failed, reload };
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

  /** Text is saved exactly as typed. `parentId` makes it a reply. */
  addUpdate: async (callbackId: string, body: string, parentId: string | null = null) =>
    parse("callback_updates", await createClient().rpc("add_callback_update", { p_callback_id: callbackId, p_body: body, p_parent_id: n(parentId) })),
  editUpdate: async (id: string, body: string) =>
    parse("callback_updates", await createClient().rpc("edit_callback_update", { p_id: id, p_body: body })),
  removeUpdate: async (id: string) =>
    parse("callback_updates", await createClient().rpc("delete_callback_update", { p_id: id })),
};
