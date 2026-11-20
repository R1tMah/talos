"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { toHM } from "./date";
import { isSpendCategory, type Spend, type SpendCategory } from "./spending";
import { announceWrite, useDataChanged } from "./undo";

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "conflict" } | { status: "failed" };

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
      category: isSpendCategory(r.category) ? r.category : "Other", note: r.note, txnId: r.finance_transaction_id,
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
  return out.status === "saved" || out.status === "not_found" || out.status === "conflict" ? { status: out.status } : { status: "failed" };
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
  /** From a checking transaction: linked to it, so it can't be added twice. "conflict" if it already was. */
  fromTransaction: async (txnId: string, s: SpendInput) =>
    parse(await createClient().rpc("spend_transaction", {
      p_transaction_id: txnId, p_date: s.date, p_amount: s.amount, p_what: s.what, p_category: s.category, p_note: orNull(s.note),
    })),
};

// ---- Saved spendings -----------------------------------------------------------------

/** A purchase made often, saved once: logging it adds a spending entry. No amount = asked each time. */
export interface SavedSpend {
  id: string;
  name: string;
  aliases: string[];
  amount: number | null;
  category: SpendCategory;
}

export interface SavedSpendInput {
  name: string;
  aliases: string[];
  amount: number | null;
  category: SpendCategory;
}

/** Every saved spending, by name. Reloads after any write or undo anywhere. */
export function useSavedSpends() {
  const [rows, setRows] = useState<SavedSpend[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("saved_spends").select("id, name, aliases, amount, category").is("deleted_at", null).order("name");
    if (res.error) return setFailed(true);
    setFailed(false);
    setRows(res.data.map((r) => ({
      id: r.id, name: r.name, aliases: r.aliases, amount: r.amount == null ? null : Number(r.amount),
      category: isSpendCategory(r.category) ? r.category : "Other",
    })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

function parseSaved(res: { data: Json | null; error: unknown }, table: "saved_spends" | "spending"): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  return out.status === "saved" || out.status === "not_found" || out.status === "conflict" ? { status: out.status } : { status: "failed" };
}

// Generated arg types mark a nullable numeric arg as `number`; null means "asked each time".
const amountArg = (n: number | null) => n as number;

export const savedSpendsApi = {
  save: async (s: SavedSpendInput) =>
    parseSaved(await createClient().rpc("save_saved_spend", { p_name: s.name, p_aliases: s.aliases, p_amount: amountArg(s.amount), p_category: s.category }), "saved_spends"),
  update: async (id: string, s: SavedSpendInput) =>
    parseSaved(await createClient().rpc("update_saved_spend", { p_id: id, p_name: s.name, p_aliases: s.aliases, p_amount: amountArg(s.amount), p_category: s.category }), "saved_spends"),
  remove: async (id: string) => parseSaved(await createClient().rpc("delete_saved_spend", { p_id: id }), "saved_spends"),
  /** Adds a spending entry from it. `amount` is a one-off price (needed when none is saved). */
  log: async (id: string, date: string, amount?: number) =>
    parseSaved(await createClient().rpc("log_saved_spend", { p_date: date, p_id: id, ...(amount != null ? { p_amount: amount } : {}) }), "spending"),
};
