"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { toHM, logicalToday } from "./date";
import type { WeekRow } from "./stats";
import type { Break, Phase, WeightEntry } from "./types";
import type { PhaseText, WeightNote } from "./weightLog";

type Tables = Database["public"]["Tables"];
type WeightRow = Tables["weights"]["Row"];

export interface WeightData {
  entries: WeightEntry[]; // newest first
  weeks: WeekRow[]; // newest first, from the weekly_weights view
  phases: Phase[];
  breaks: Break[];
  /** Phase descriptions in the owner's words, for the log view. */
  phaseTexts: PhaseText[];
  /** Dated free-text notes in the weight log (notes.kind = 'weight'). */
  notes: WeightNote[];
  /** Every phase with all its fields, oldest first, for the Phases list and form. */
  phaseRows: PhaseRow[];
}

/** A phase as stored. A null end means it's the current, open-ended phase. */
export interface PhaseRow {
  id: string;
  start: string;
  end: string | null;
  name: string | null;
  calories: number | null;
  protein: number | null;
  description: string | null;
}
export interface PhaseInput { start: string; end: string | null; name: string | null; calories: number | null; protein: number | null; description: string | null }
/** A phase write: saved, refused because it overlaps another phase, or invalid. */
export type PhaseResult = { status: "saved" } | { status: "overlap"; existing: PhaseRow } | { status: "invalid"; detail: string } | { status: "failed" };

const toPhaseRow = (r: Tables["phases"]["Row"]): PhaseRow => ({
  id: r.id, start: r.start_date, end: r.end_date, name: r.name, calories: r.calorie_target, protein: r.protein_target_g, description: r.description,
});

/** Outcome of a write. A conflict carries the row already on that date. */
export type WriteResult =
  | { status: "saved" }
  | { status: "conflict"; existing: WeightEntry }
  | { status: "not_found" }
  | { status: "failed" };

// Entry time is shown for ordering only; the table has no separate time column.
const toEntry = (r: WeightRow): WeightEntry => ({
  id: r.id,
  date: r.logical_date,
  time: toHM(new Date(r.created_at)),
  lb: Number(r.weight_lb),
  note: r.note ?? undefined,
});

const toPhase = (r: Tables["phases"]["Row"]): Phase => ({
  id: r.id,
  name: r.name ?? (r.calorie_target ? `${r.calorie_target} cal` : ""),
  start: r.start_date,
  end: r.end_date ?? logicalToday(),
});

const toBreak = (r: Tables["breaks"]["Row"]): Break => ({
  id: r.id,
  start: r.start_date,
  end: r.end_date,
  label: r.label,
});

/** Loads everything the Weight tab shows. Call `reload` after a write. */
export function useWeightData() {
  const [data, setData] = useState<WeightData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [w, wk, ph, br, nt] = await Promise.all([
      db.from("weights").select("*").is("deleted_at", null)
        .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
      db.from("weekly_weights").select("*").order("week_start", { ascending: false }),
      db.from("phases").select("*").is("deleted_at", null).order("start_date"),
      db.from("breaks").select("*").is("deleted_at", null).order("start_date", { ascending: false }),
      db.from("notes").select("id, logical_date, body").eq("kind", "weight").is("deleted_at", null)
        .order("logical_date").order("created_at"),
    ]);
    if (w.error || wk.error || ph.error || br.error || nt.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      entries: w.data.map(toEntry),
      weeks: wk.data.map((r) => ({
        id: r.week_start!,
        week: r.week_start!,
        avg: Number(r.avg_lb),
        days: Number(r.n),
        partial: Number(r.n) < 7,
      })),
      phases: ph.data.map(toPhase),
      breaks: br.data.map(toBreak),
      phaseTexts: ph.data.map((p) => ({ id: p.id, start: p.start_date, calories: p.calorie_target, description: p.description })),
      notes: nt.data.map((n) => ({ id: n.id, date: n.logical_date, body: n.body })),
      phaseRows: ph.data.map(toPhaseRow),
    });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; existing?: WeightRow } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "conflict" && out.existing) return { status: "conflict", existing: toEntry(out.existing) };
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

// The functions accept null (clear a note, ongoing break); generated arg types don't say so.
const orNull = (v: string | null | undefined) => (v ?? null) as string;

/** Writes go through the database functions so each one also logs an actions row. */
export const weightApi = {
  save: async (date: string, lb: number, note?: string) =>
    parse("weights", await createClient().rpc("save_weight", { p_date: date, p_weight_lb: lb, p_note: orNull(note) })),
  update: async (id: string, date: string, lb: number, note?: string) =>
    parse("weights", await createClient().rpc("update_weight", { p_id: id, p_date: date, p_weight_lb: lb, p_note: orNull(note) })),
  remove: async (id: string) => parse("weights", await createClient().rpc("delete_weight", { p_id: id })),

  saveBreak: async (start: string, end: string | null, label: string) =>
    parse("breaks", await createClient().rpc("save_break", { p_start: start, p_end: orNull(end), p_label: label })),
  updateBreak: async (id: string, start: string, end: string | null, label: string) =>
    parse("breaks", await createClient().rpc("update_break", { p_id: id, p_start: start, p_end: orNull(end), p_label: label })),
  removeBreak: async (id: string) => parse("breaks", await createClient().rpc("delete_break", { p_id: id })),

  addPhase: async (p: PhaseInput) => parsePhase(await createClient().rpc("add_phase", phaseArgs(p))),
  updatePhase: async (id: string, p: PhaseInput) => parsePhase(await createClient().rpc("update_phase", { p_id: id, ...phaseArgs(p) })),
  removePhase: async (id: string) => parsePhase(await createClient().rpc("delete_phase", { p_id: id })),
};

// Nulls are allowed for every optional field; the generated arg types don't say so.
const phaseArgs = (p: PhaseInput) => ({
  p_start: p.start, p_end: orNull(p.end), p_name: orNull(p.name),
  p_calories: p.calories as number, p_protein: p.protein as number, p_description: orNull(p.description),
});

function parsePhase(res: { data: Json | null; error: unknown }): PhaseResult {
  const out = res.data as { status?: string; detail?: string; existing?: Tables["phases"]["Row"] } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite("phases", out as { row?: Json; action_id?: string | null });
  if (out.status === "overlap" && out.existing) return { status: "overlap", existing: toPhaseRow(out.existing) };
  if (out.status === "invalid") return { status: "invalid", detail: out.detail ?? "Invalid phase." };
  return out.status === "saved" ? { status: "saved" } : { status: "failed" };
}
