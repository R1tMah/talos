"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { fmtDay } from "./date";
import { cancelRest } from "./workoutClock";

/**
 * App-wide undo. Every write logs an actions row; after one, a toast offers Undo.
 * Undoing says what was undone and offers Redo. All text here is built by code
 * from the stored rows, never by a model.
 */

type Row = Record<string, unknown>;
export interface ActionRow {
  id: string;
  tool: string;
  table_name: string;
  before: Row | null;
  after: Row | null;
}

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface ToastMsg {
  text: string;
  action?: ToastAction;
  tone?: "ok" | "error";
}

const TOAST = "talos:toast";
const CHANGED = "talos:data-changed";

export function showToast(t: ToastMsg) {
  window.dispatchEvent(new CustomEvent<ToastMsg>(TOAST, { detail: t }));
}

export function onToast(cb: (t: ToastMsg) => void) {
  const h = (e: Event) => cb((e as CustomEvent<ToastMsg>).detail);
  window.addEventListener(TOAST, h);
  return () => window.removeEventListener(TOAST, h);
}

/** Tell open screens their data changed (after an undo or redo). */
export const dataChanged = () => window.dispatchEvent(new Event(CHANGED));

/** Reload a screen's data whenever an undo or redo happens anywhere. */
export function useDataChanged(reload: () => void) {
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
}

const str = (v: unknown) => (v == null ? "" : String(v));

/** "weight 168.2 lb, Oct 10", "chipotle bowl (650 cal)", ... */
export function describeRow(table: string, r: Row | null): string {
  if (!r) return table;
  switch (table) {
    case "weights":
      return `weight ${Number(r.weight_lb).toFixed(1)} lb, ${fmtDay(str(r.logical_date))}`;
    case "food_log":
      return `${str(r.description)} (${str(r.calories)} cal)`;
    case "saved_meals":
      return `saved meal ${str(r.name)}`;
    case "leetcode_log":
      return str(r.title);
    case "callbacks":
      return `${str(r.company)} ${str(r.kind)}`;
    case "notes":
      return r.kind === "journal" ? "journal entry" : r.kind === "weight" ? "weight note" : "content idea";
    case "breaks":
      return `break "${str(r.label)}"`;
    case "applications":
      return `${str(r.company)} application`;
    case "foods":
      return `food ${str(r.name)}`;
    case "application_reminders":
      return `reminder to apply to ${str(r.company)}`;
    case "sets":
      return `set ${r.weight_lb == null ? "bodyweight" : `${Number(r.weight_lb)} lb`} × ${str(r.reps)}`;
    case "workouts":
      return `workout, ${fmtDay(str(r.logical_date))}`;
    case "exercises":
      return `exercise ${str(r.name)}`;
    default:
      return table;
  }
}

/** "logged", "edited" or "deleted", from the action's before/after. */
export function verbOf(a: Pick<ActionRow, "before" | "after">) {
  if (!a.before) return "logged";
  if (a.after && a.after.deleted_at && !a.before.deleted_at) return "deleted";
  return "edited";
}

export const describeAction = (a: ActionRow) => `${verbOf(a)} ${describeRow(a.table_name, a.after ?? a.before)}`;

export type UndoResult =
  | { status: "done"; text: string; redoId: string | null }
  | { status: "nothing" | "conflict" | "failed" };

/** Reverts one action (or the latest when no id), then reports it with a Redo link. */
export async function undo(actionId?: string | null): Promise<UndoResult> {
  const { data, error } = await createClient().rpc("undo_action", actionId ? { p_action_id: actionId } : {});
  const out = data as { status?: string; kind?: string; action?: ActionRow; redo_id?: string | null } | null;
  if (error || !out) return finish({ status: "failed" });
  if (out.status === "nothing") return finish({ status: "nothing" });
  if (out.status === "conflict") return finish({ status: "conflict" });
  if (out.status !== "done" || !out.action) return finish({ status: "failed" });
  const what = describeAction(out.action);
  // Undoing a set also stops the rest countdown it started.
  if (out.action.table_name === "sets" && out.kind !== "redo") cancelRest();
  return finish({ status: "done", text: out.kind === "redo" ? `Redid: ${what}` : `Undid: ${what}`, redoId: out.redo_id ?? null });
}

function finish(r: UndoResult): UndoResult {
  if (r.status === "done") {
    dataChanged();
    const redoId = r.redoId;
    showToast({ text: r.text, action: redoId ? { label: "Redo", run: () => undo(redoId) } : undefined });
  } else if (r.status === "nothing") showToast({ text: "Nothing to undo." });
  else if (r.status === "conflict") showToast({ text: "That entry changed since, so it wasn't undone.", tone: "error" });
  else showToast({ text: "Failed", tone: "error" });
  return r;
}

/**
 * Call after a successful write from a tab: shows "Saved: ... · Undo".
 * `out` is the jsonb a write function returned ({ row, action_id }).
 */
export function announceWrite(table: string, out: { row?: Json; action_id?: string | null } | null) {
  if (!out?.action_id) return; // unchanged text etc.: nothing was written
  const row = out.row as Row | undefined;
  const verb = row?.deleted_at ? "Deleted" : "Saved";
  const actionId = out.action_id;
  showToast({ text: `${verb}: ${describeRow(table, row ?? null)}`, action: { label: "Undo", run: () => undo(actionId) } });
}
