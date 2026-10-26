"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { toHM } from "./date";
import { isSpendCategory, type Spend, type SpendCategory } from "./spending";
import { announceWrite, useDataChanged } from "./undo";

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

/** Every live spending entry, newest first. Reloads after any write or undo anywhere. */
export function useSpending() {
  const [rows, setRows] = useState<Spend[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("spending").select("*").is("deleted_at", null)
      .order("logical_date", { ascending: false }).order("created_at", { ascending: false });
    if (res.error) return setFailed(true);
    setFailed(false);
    setRows(res.data.map((r) => ({
      id: r.id, date: r.logical_date, time: toHM(new Date(r.created_at)), amount: Number(r.amount), what: r.what,
      category: isSpendCategory(r.category) ? r.category : "Other", note: r.note,
    })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite("spending", out as { row?: Json; action_id?: string | null });
  return out.status === "saved" || out.status === "not_found" ? { status: out.status } : { status: "failed" };
}

export interface SpendInput {
  date: string;
  amount: number;
  what: string;
  category: SpendCategory;
  note: string | null;
}

// Generated arg types mark optional text args as `string`; null is what we mean by "none".
const orNull = (v: string | null) => (v || null) as string;

/** Writes go through the database functions, which log an actions row (so Undo works). */
export const spendingApi = {
  log: async (s: SpendInput) =>
    parse(await createClient().rpc("log_spending", { p_date: s.date, p_amount: s.amount, p_what: s.what, p_category: s.category, p_note: orNull(s.note) })),
  update: async (id: string, s: SpendInput) =>
    parse(await createClient().rpc("update_spending", { p_id: id, p_date: s.date, p_amount: s.amount, p_what: s.what, p_category: s.category, p_note: orNull(s.note) })),
  remove: async (id: string) => parse(await createClient().rpc("delete_spending", { p_id: id })),
};
