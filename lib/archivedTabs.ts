"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { TabKey } from "./tabs";
import { dataChanged, useDataChanged } from "./undo";

/** The archived tabs, from the settings row. Null while loading. Reloads after any change. */
export function useArchivedTabs() {
  const [archived, setArchived] = useState<Set<TabKey> | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await createClient().from("settings").select("archived_tabs").eq("id", 1).single();
    if (!error) setArchived(new Set(data.archived_tabs as TabKey[]));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  return archived;
}

/** Archives or unarchives a tab. Every open screen reloads so cards and bars update together. */
export async function setTabArchived(tab: TabKey, archived: boolean): Promise<boolean> {
  const { data, error } = await createClient().rpc("set_tab_archived", { p_tab: tab, p_archived: archived });
  const status = (data as { status?: string } | null)?.status;
  if (error || (status !== "saved" && status !== "unchanged")) return false;
  dataChanged();
  return true;
}
