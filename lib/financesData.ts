"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { toHM } from "./date";
import { netWorth, vanguardTotal, type BalanceReading, type Holding, type Snapshot, type Transaction } from "./finances";
import { announceWrite, useDataChanged } from "./undo";

export interface FinancesData {
  transactions: Transaction[]; // newest first
  balance: BalanceReading | null; // the latest checking reading
  holdings: Holding[]; // largest first
  snapshots: Snapshot[]; // oldest first
}

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

async function load(): Promise<FinancesData | null> {
  const db = createClient();
  const [txns, bal, holds, snaps] = await Promise.all([
    db.from("finance_transactions").select("*").is("deleted_at", null)
      .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("checking_balances").select("*").is("deleted_at", null)
      .order("logical_date", { ascending: false }).order("created_at", { ascending: false }).limit(1),
    db.from("vanguard_holdings").select("*").is("deleted_at", null).order("value", { ascending: false }),
    db.from("net_worth_snapshots").select("*").order("snapshot_date"),
  ]);
  if (txns.error || bal.error || holds.error || snaps.error) return null;
  const b = bal.data[0];
  return {
    transactions: txns.data.map((r) => ({
      id: r.id, date: r.logical_date, time: toHM(new Date(r.created_at)), amount: Number(r.amount),
      description: r.description, category: r.category, note: r.note,
    })),
    balance: b ? { id: b.id, date: b.logical_date, balance: Number(b.balance) } : null,
    holdings: holds.data.map((r) => ({ id: r.id, fund: r.fund, shares: Number(r.shares), value: Number(r.value), updatedAt: r.updated_at })),
    snapshots: snaps.data.map((r) => ({
      date: r.snapshot_date, checking: r.checking == null ? null : Number(r.checking),
      vanguard: r.vanguard == null ? null : Number(r.vanguard), total: Number(r.total),
    })),
  };
}

/** Everything the Finances tab shows. Reloads after any write or undo anywhere. */
export function useFinances() {
  const [data, setData] = useState<FinancesData | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const d = await load();
    setFailed(!d);
    if (d) setData(d);
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

/**
 * The Tabs-page card's numbers, read on their own so a Finances problem can't blank
 * the other cards (lib/homeStats.ts is all-or-nothing).
 */
export function useFinanceSummary() {
  const [data, setData] = useState<{ checking: number | null; vanguard: number | null; net: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useDataChanged(useCallback(() => setTick((t) => t + 1), []));

  useEffect(() => {
    let live = true;
    const db = createClient();
    Promise.all([
      db.from("checking_balances").select("balance").is("deleted_at", null)
        .order("logical_date", { ascending: false }).order("created_at", { ascending: false }).limit(1),
      db.from("vanguard_holdings").select("value").is("deleted_at", null),
    ]).then(([bal, holds]) => {
      if (!live) return;
      if (bal.error || holds.error) return setFailed(true);
      const checking = bal.data[0] ? Number(bal.data[0].balance) : null;
      const vanguard = vanguardTotal(holds.data.map((r) => ({ value: Number(r.value) })));
      setData({ checking, vanguard, net: netWorth(checking, vanguard) });
    });
    return () => {
      live = false;
    };
  }, [tick]);

  return { data, failed };
}

function parse(table: string, res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved" || out.status === "not_found") return { status: out.status };
  return { status: "failed" };
}

export interface TransactionInput {
  date: string;
  amount: number;
  description: string;
  category: string | null;
  note: string | null;
}

export interface HoldingInput {
  fund: string;
  shares: number;
  value: number;
}

// Generated arg types mark optional text args as `string`; null is what we mean by "none".
const orNull = (v: string | null) => (v || null) as string;

/** Writes go through the database functions, which validate and log an actions row (so Undo works). */
export const financesApi = {
  logTransaction: async (t: TransactionInput) =>
    parse("finance_transactions", await createClient().rpc("log_transaction", {
      p_date: t.date, p_amount: t.amount, p_description: t.description, p_category: orNull(t.category), p_note: orNull(t.note),
    })),
  updateTransaction: async (id: string, t: TransactionInput) =>
    parse("finance_transactions", await createClient().rpc("update_transaction", {
      p_id: id, p_date: t.date, p_amount: t.amount, p_description: t.description, p_category: orNull(t.category), p_note: orNull(t.note),
    })),
  removeTransaction: async (id: string) => parse("finance_transactions", await createClient().rpc("delete_transaction", { p_id: id })),
  setBalance: async (date: string, balance: number) =>
    parse("checking_balances", await createClient().rpc("set_checking_balance", { p_date: date, p_balance: balance })),
  addHolding: async (h: HoldingInput) =>
    parse("vanguard_holdings", await createClient().rpc("add_holding", { p_fund: h.fund, p_shares: h.shares, p_value: h.value })),
  updateHolding: async (id: string, h: HoldingInput) =>
    parse("vanguard_holdings", await createClient().rpc("update_holding", { p_id: id, p_fund: h.fund, p_shares: h.shares, p_value: h.value })),
  removeHolding: async (id: string) => parse("vanguard_holdings", await createClient().rpc("delete_holding", { p_id: id })),
};
