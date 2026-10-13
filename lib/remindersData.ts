"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { announceWrite, dataChanged, useDataChanged } from "./undo";

/** A posting the owner plans to apply to. */
export interface Reminder {
  id: string;
  company: string;
  position: string;
  noted: string; // logical date it was noted
}

export type ReminderResult = { status: "saved" } | { status: "conflict" } | { status: "not_found" } | { status: "failed" };

/** Open reminders, oldest first. Reloads after any write or undo anywhere. */
export function useReminders() {
  const [rows, setRows] = useState<Reminder[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("open_application_reminders").select("*");
    if (res.error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(res.data.map((r) => ({ id: r.id!, company: r.company!, position: r.position!, noted: r.noted_date! })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, failed, reload };
}

function parse(table: string, res: { data: Json | null; error: unknown }): ReminderResult {
  const out = res.data as { status?: string } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite(table, out as { row?: Json; action_id?: string | null });
  if (out.status === "saved" || out.status === "conflict" || out.status === "not_found") {
    // Applying changes the applications list and counts too; let every open screen reload.
    if (out.status === "saved") dataChanged();
    return { status: out.status };
  }
  return { status: "failed" };
}

export const remindersApi = {
  add: async (company: string, position: string, date: string) =>
    parse(
      "application_reminders",
      await createClient().rpc("add_application_reminder", { p_company: company, p_position: position, p_date: date }),
    ),
  /** Creates the application and closes the reminder, in one database step. */
  apply: async (id: string, date: string, resume: string | null) =>
    parse(
      "applications",
      await createClient().rpc("apply_application_reminder", { p_id: id, p_date: date, p_resume_name: (resume || null) as string }),
    ),
  dismiss: async (id: string) => parse("application_reminders", await createClient().rpc("dismiss_application_reminder", { p_id: id })),
};
