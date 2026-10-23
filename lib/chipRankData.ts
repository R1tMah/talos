"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { LOOKBACK_DAYS, topChips, type UseEvent } from "./chipRank";
import { isChatTab, type ChatTab } from "./tabs";

/** Which tab a save belongs to, by the table it wrote (and a note's kind). Others don't count. */
const TABLE_TAB: Record<string, ChatTab> = {
  weights: "weight",
  food_log: "nutrition", saved_meals: "nutrition", foods: "nutrition",
  leetcode_log: "leetcode",
  runs: "runs",
  applications: "applications", application_reminders: "applications",
  callbacks: "callbacks",
};

export function tabOfSave(table: string, kind: string | null): ChatTab | null {
  if (table !== "notes") return TABLE_TAB[table] ?? null;
  if (kind === "weight") return "weight";
  return kind === "journal" || kind === "personal" || kind === "talos" ? kind : "content";
}

/**
 * The last eight weeks of use: new rows in the actions log (not edits, deletes,
 * undos or undone saves) and messages sent with a chip. Null when the saves can't be
 * read; chip sends are a bonus, so without them (e.g. before message_log.tab exists)
 * the ranking runs on saves alone.
 */
async function loadUse(): Promise<UseEvent[] | null> {
  const db = createClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const [saves, sends] = await Promise.all([
    db.from("actions").select("created_at, table_name, kind:after->>kind")
      .is("before", null).is("reverts", null).is("undone_at", null).gte("created_at", since),
    db.from("message_log").select("created_at, tab").not("tab", "is", null).gte("created_at", since),
  ]);
  if (saves.error) {
    console.warn(`[chips] couldn't read saves: ${saves.error.message}`);
    return null;
  }
  if (sends.error) console.warn(`[chips] couldn't read chip sends, ranking on saves only: ${sends.error.message}`);
  const out: UseEvent[] = [];
  for (const r of saves.data) {
    const tab = tabOfSave(r.table_name, (r.kind as string | null) ?? null);
    if (tab) out.push({ tab, at: new Date(r.created_at), chip: false });
  }
  for (const r of sends.data ?? []) if (isChatTab(r.tab)) out.push({ tab: r.tab, at: new Date(r.created_at), chip: true });
  return out;
}

const KEY = "talos-top-chips";
const cached = (): ChatTab[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(isChatTab) : [];
  } catch {
    return [];
  }
};

/**
 * The tabs to put first in Chat right now, from the ones shown. History is read when
 * Chat opens and when the app comes back to the foreground, never while it's in view,
 * so chips don't move under a finger. Until the first read, the last answer is used,
 * so opening doesn't visibly reshuffle.
 */
export function useTopChips(shown: readonly ChatTab[]): ChatTab[] {
  const [snap, setSnap] = useState<{ events: UseEvent[]; at: Date } | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const events = await loadUse();
      if (live && events) setSnap({ events, at: new Date() });
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const key = shown.join(",");
  const top = useMemo(
    () => (snap ? topChips(snap.events, snap.at, key ? (key.split(",") as ChatTab[]) : []) : null),
    [snap, key],
  );
  useEffect(() => {
    if (!top) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(top));
    } catch {}
  }, [top]);

  // Read after mount: the server render has no localStorage.
  const [fromCache, setFromCache] = useState<ChatTab[]>([]);
  useEffect(() => setFromCache(cached()), []);
  return (top ?? fromCache).filter((t) => shown.includes(t));
}
