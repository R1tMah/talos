"use client";

// Reads and writes for Finances > Subscriptions. Writes go through the database
// functions, which also log an actions row (Undo). Arithmetic is in lib/subscriptions.ts.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import type { Cadence, Subscription } from "./subscriptions";
import { announceWrite, useDataChanged } from "./undo";

export type WriteResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

export interface SubscriptionInput {
  name: string;
  amount: number;
  cadence: Cadence;
  startedOn: string;
  note: string | null;
}

/** Every subscription that isn't deleted: active ones first, then cancelled, each by name. */
export function useSubscriptions() {
  const [rows, setRows] = useState<Subscription[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("subscriptions").select("*").is("deleted_at", null).order("name");
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const all = res.data.map((r): Subscription => ({
      id: r.id, name: r.name, amount: Number(r.amount), cadence: r.cadence as Cadence,
      startedOn: r.started_on, cancelledOn: r.cancelled_on, note: r.note,
    }));
    setRows([...all.filter((s) => !s.cancelledOn), ...all.filter((s) => s.cancelledOn)]);
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
  announceWrite("subscriptions", out as { row?: Json; action_id?: string | null });
  return out.status === "saved" || out.status === "not_found" ? { status: out.status } : { status: "failed" };
}

const orNull = (v: string | null) => v as string; // the functions take null; generated arg types don't say so

export const subscriptionsApi = {
  add: async (s: SubscriptionInput) =>
    parse(await createClient().rpc("add_subscription", { p_name: s.name, p_amount: s.amount, p_cadence: s.cadence, p_date: s.startedOn, p_note: orNull(s.note) })),
  update: async (id: string, s: SubscriptionInput) =>
    parse(await createClient().rpc("update_subscription", {
      p_id: id, p_name: s.name, p_amount: s.amount, p_cadence: s.cadence, p_date: s.startedOn, p_note: orNull(s.note),
    })),
  /** Cancel on `date`, or resume with null. */
  setCancelled: async (id: string, date: string | null) =>
    parse(await createClient().rpc("set_subscription_cancelled", { p_id: id, p_date: orNull(date) })),
  remove: async (id: string) => parse(await createClient().rpc("delete_subscription", { p_id: id })),
};
