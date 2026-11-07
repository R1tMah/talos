"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { announceWrite, dataChanged, useDataChanged } from "./undo";

/** A general reminder: the owner's own words and an optional due date. */
export interface GeneralReminder {
  id: string;
  body: string; // verbatim
  due: string | null; // logical date
  surface: string | null; // long-term: the day it starts showing on TALOS; null = an ordinary reminder
  noted: string;
  created: string; // when it was added, for its "open for" tag
}

export type GeneralReminderResult = { status: "saved" } | { status: "not_found" } | { status: "failed" };

/** Open reminders: dated ones by due date, then undated ones oldest first. */
export function useGeneralReminders() {
  const [rows, setRows] = useState<GeneralReminder[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("open_reminders").select("*");
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(res.data.map((r) => ({ id: r.id!, body: r.body!, due: r.due_date, surface: r.surface_date, noted: r.noted_date!, created: r.created_at! })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, failed, reload };
}

export interface LongTermReminder extends GeneralReminder {
  surface: string;
  surfaced: boolean; // its day has come: it's on the TALOS banner now
}

/** Every open long-term reminder, shown on TALOS yet or not, soonest "show from" first. */
export function useLongTermReminders() {
  const [rows, setRows] = useState<LongTermReminder[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("open_long_term_reminders").select("*");
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(
      res.data.map((r) => ({
        id: r.id!, body: r.body!, due: r.due_date, surface: r.surface_date!, surfaced: !!r.surfaced, noted: r.noted_date!, created: r.created_at!,
      })),
    );
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): GeneralReminderResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite("reminders", out as { row?: Json; action_id?: string | null });
  // Done, dismissed, added or edited: let the list (and anything else showing reminders) reload.
  if (out.status === "saved") dataChanged();
  return out.status === "saved" || out.status === "not_found" ? { status: out.status } : { status: "failed" };
}

// The functions accept null for "no due date" / "not long-term"; generated arg types don't say so.
const orNull = (v: string | null) => v as string;

/** Writes go through the database functions, which also log an actions row (Undo). */
export const generalRemindersApi = {
  /** `surface` set makes it long-term: off the banner until that day. */
  add: async (body: string, due: string | null, date: string, surface: string | null = null) =>
    parse(await createClient().rpc("add_reminder", { p_body: body, p_due: orNull(due), p_date: date, p_surface: orNull(surface) })),
  /** Saves all three as given; pass the reminder's current `surface` to keep it long-term. */
  update: async (id: string, body: string, due: string | null, surface: string | null) =>
    parse(await createClient().rpc("update_reminder", { p_id: id, p_body: body, p_due: orNull(due), p_surface: orNull(surface) })),
  complete: async (id: string) => parse(await createClient().rpc("complete_reminder", { p_id: id })),
  dismiss: async (id: string) => parse(await createClient().rpc("dismiss_reminder", { p_id: id })),
};
