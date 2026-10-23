"use client";

import { createClient } from "@/utils/supabase/client";
import type { Database } from "./database.types";

/**
 * Full backup of the owner's data, straight from Supabase: every row of every table
 * the app writes, soft-deleted rows included (they're part of the history Undo can
 * restore). Logs and reference data are left out: actions, message_log,
 * pending_proposals, lc_catalog.
 */
const TABLES = [
  "settings", "weights", "phases", "breaks",
  "food_log", "foods", "saved_meals", "saved_meal_items",
  "leetcode_log", "applications", "application_reminders", "reminders", "callbacks", "notes",
  "runs", "workouts", "sets", "exercises", "plans", "plan_exercises",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];

const PAGE = 1000; // PostgREST returns at most this many rows per request

async function allRows(table: (typeof TABLES)[number]) {
  const db = createClient();
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`backup: ${table}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function buildBackup() {
  const entries = await Promise.all(TABLES.map(async (t) => [t, await allRows(t)] as const));
  return {
    app: "talos",
    exported_at: new Date().toISOString(),
    counts: Object.fromEntries(entries.map(([t, rows]) => [t, rows.length])),
    tables: Object.fromEntries(entries),
  };
}
