"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";
import { logicalToday, weekStart } from "./date";

type Row = Database["public"]["Tables"]["leetcode_log"]["Row"];

export type Difficulty = "easy" | "medium" | "hard";
export type Hints = "none" | "small" | "multiple";
export type Result = "solved" | "optimal" | "suboptimal" | "failed";

export interface Attempt {
  id: string;
  date: string;
  title: string;
  difficulty: Difficulty | null;
  topic: string | null;
  /** Difficulty/topic came from the model, not the catalog. */
  inferred: boolean;
  inCatalog: boolean;
  minutes: number | null;
  hints: Hints | null;
  result: Result | null;
  redo: boolean;
  notes: string | null;
}

/** leetcode_counts rows grouped by dimension: { difficulty: { medium: 5 }, ... }. */
export type Counts = Record<string, Record<string, number>>;

export interface LeetcodeData {
  log: Attempt[]; // newest first
  redo: Attempt[]; // oldest first
  week: Counts; // this logical week, Monday through today
  all: Counts;
}

export type WriteResult =
  | { status: "saved" }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found" }
  | { status: "failed" };

const toAttempt = (r: Row): Attempt => ({
  id: r.id,
  date: r.logical_date,
  title: r.title,
  difficulty: r.difficulty as Difficulty | null,
  topic: r.topic,
  inferred: r.inferred,
  inCatalog: r.catalog_id != null,
  minutes: r.minutes == null ? null : Number(r.minutes),
  hints: r.hints as Hints | null,
  result: r.result as Result | null,
  redo: r.redo,
  notes: r.notes,
});

const group = (rows: { dimension: string; key: string; n: number }[]): Counts => {
  const out: Counts = {};
  for (const r of rows) (out[r.dimension] ??= {})[r.key] = r.n;
  return out;
};

/** Loads the log, redo queue and counts. Call `reload` after a write. */
export function useLeetcodeData() {
  const [data, setData] = useState<LeetcodeData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const today = logicalToday();
    const [log, redo, week, all] = await Promise.all([
      db.from("leetcode_log").select("*").is("deleted_at", null)
        .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
      db.from("redo_queue").select("*"),
      db.rpc("leetcode_counts", { p_from: weekStart(today), p_to: today }),
      db.rpc("leetcode_counts", { p_from: "2000-01-01", p_to: today }),
    ]);
    if (log.error || redo.error || week.error || all.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      log: log.data.map(toAttempt),
      redo: redo.data.map((r) => toAttempt(r as Row)),
      week: group(week.data),
      all: group(all.data),
    });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; candidates?: { title: string }[] } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "ambiguous") return { status: "ambiguous", candidates: (out.candidates ?? []).map((c) => c.title) };
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

export interface AttemptInput {
  date: string;
  title: string;
  minutes: number | null;
  hints: Hints | null;
  result: Result | null;
  redo: boolean;
  notes: string | null;
  /** Used only when the title isn't in the catalog. */
  difficulty: Difficulty | null;
  topic: string | null;
}

// The functions accept null for empty fields; generated arg types don't mark it.
const n = <T,>(v: T | null) => v as T;

/** Writes go through the database functions: catalog lookup, validation and the actions row. */
export const leetcodeApi = {
  log: async (a: AttemptInput) =>
    parse("leetcode_log", 
      await createClient().rpc("log_leetcode", {
        p_date: a.date, p_title: a.title, p_minutes: n(a.minutes), p_hints: n(a.hints), p_result: n(a.result),
        p_redo: a.redo, p_notes: n(a.notes), p_difficulty: n(a.difficulty), p_topic: n(a.topic),
      }),
    ),
  update: async (id: string, a: AttemptInput) =>
    parse("leetcode_log", 
      await createClient().rpc("update_leetcode", {
        p_id: id, p_date: a.date, p_title: a.title, p_minutes: n(a.minutes), p_hints: n(a.hints), p_result: n(a.result),
        p_redo: a.redo, p_notes: n(a.notes), p_difficulty: n(a.difficulty), p_topic: n(a.topic),
      }),
    ),
  setRedo: async (id: string, redo: boolean) => parse("leetcode_log", await createClient().rpc("set_leetcode_redo", { p_id: id, p_redo: redo })),
  remove: async (id: string) => parse("leetcode_log", await createClient().rpc("delete_leetcode", { p_id: id })),
};
