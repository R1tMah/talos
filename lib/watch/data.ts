"use client";

// Reading Watch from Supabase, plus the owner's own writes: source settings, "seen",
// and asking the server to refresh a source now. Snapshots are only written by the
// server's refresh job.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "@/lib/database.types";
import type { JobData, TransitSnap, WatchKind } from "./types";

type Row = Database["public"]["Tables"]["watch_sources"]["Row"];

export interface WatchSource {
  id: string;
  kind: WatchKind;
  title: string;
  config: Record<string, unknown>;
  position: number;
  enabled: boolean;
  everyMinutes: number;
  data: unknown;
  fetchedAt: string | null;
  triedAt: string | null;
  error: string | null;
  seenAt: string | null;
  /** Jobs only: open postings first seen since the owner last looked. */
  newCount?: number;
}

const toSource = (r: Row): WatchSource => ({
  id: r.id, kind: r.kind as WatchKind, title: r.title, config: (r.config ?? {}) as Record<string, unknown>,
  position: r.position, enabled: r.enabled, everyMinutes: r.every_minutes, data: r.data, fetchedAt: r.fetched_at,
  triedAt: r.tried_at, error: r.error, seenAt: r.seen_at,
});

/** Before the owner has ever opened the jobs tab, "new" means first seen in the last 3 days. */
export const newSince = (s: Pick<WatchSource, "seenAt">) => s.seenAt ?? new Date(Date.now() - 3 * 86_400_000).toISOString();

/**
 * True when the snapshot can't be trusted as current: never fetched, or the last
 * successful fetch is older than three refresh intervals. The tab then leads with
 * the link to the original.
 */
export const isStale = (s: WatchSource) =>
  !s.fetchedAt || Date.now() - Date.parse(s.fetchedAt) > 3 * s.everyMinutes * 60_000 + 15 * 60_000;

const CALENDAR_FRESH_MS = 60_000;

/**
 * Opening Watch, or coming back to it, refetches any calendar not tried in the last
 * minute, so an event added or deleted in Google shows right away instead of at the
 * next job (every 5 minutes).
 */
export function useFreshCalendars(sources: WatchSource[] | null, reload: () => Promise<void>) {
  const latest = useRef(sources);
  latest.current = sources;
  const running = useRef(false);
  const loaded = sources != null;

  useEffect(() => {
    if (!loaded) return;
    const check = async () => {
      if (document.visibilityState !== "visible" || running.current) return;
      const stale = (latest.current ?? []).filter(
        (s) => s.kind === "calendar" && s.enabled && (!s.triedAt || Date.now() - Date.parse(s.triedAt) > CALENDAR_FRESH_MS),
      );
      if (!stale.length) return;
      running.current = true;
      await Promise.all(stale.map((s) => watchApi.refresh(s.id)));
      running.current = false;
      await reload();
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [loaded, reload]);
}

export function useWatchSources() {
  const [data, setData] = useState<WatchSource[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const res = await db.from("watch_sources").select("*").order("position").order("created_at");
    if (res.error) {
      setFailed(true);
      return;
    }
    const sources = res.data.map(toSource);
    await Promise.all(
      sources.filter((s) => s.kind === "jobs").map(async (s) => {
        const c = await db.from("watch_items").select("key", { count: "exact", head: true })
          .eq("source_id", s.id).is("closed_at", null).gt("first_seen", newSince(s));
        s.newCount = c.count ?? 0;
      }),
    );
    setFailed(false);
    setData(sources);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, failed, reload };
}

export interface JobItem extends JobData {
  key: string;
  firstSeen: string;
  closedAt: string | null;
}

/** A jobs source's postings, newest first: every open one, plus ones closed in the last two weeks. */
export async function loadJobs(sourceId: string): Promise<JobItem[] | null> {
  const db = createClient();
  const closedCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const out: JobItem[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await db.from("watch_items").select("*").eq("source_id", sourceId)
      .or(`closed_at.is.null,closed_at.gt.${closedCutoff}`)
      .order("first_seen", { ascending: false }).order("key").range(from, from + 999);
    if (res.error) return null;
    out.push(...res.data.map((r) => ({ ...(r.data as unknown as JobData), key: r.key, firstSeen: r.first_seen, closedAt: r.closed_at })));
    if (res.data.length < 1000) return out;
  }
}

/** Lowercased company names already in Applications, for the "Applied" flag. */
export async function loadAppliedCompanies(): Promise<Set<string>> {
  const res = await createClient().from("applications").select("company").is("deleted_at", null);
  return new Set((res.data ?? []).map((a) => companyKey(a.company)));
}

/** "Google LLC" and "google" are the same company for the Applied flag. */
export const companyKey = (name: string) =>
  name.toLowerCase().replace(/[.,]/g, "").replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, "").replace(/\s+/g, " ").trim();

export async function loadSource(id: string): Promise<WatchSource | null> {
  const res = await createClient().from("watch_sources").select("*").eq("id", id).maybeSingle();
  return res.data ? toSource(res.data) : null;
}

export type SourceInput = Pick<WatchSource, "title" | "config" | "enabled" | "everyMinutes">;

export const watchApi = {
  async save(id: string, v: SourceInput): Promise<boolean> {
    const res = await createClient().from("watch_sources")
      .update({ title: v.title, config: v.config as Json, enabled: v.enabled, every_minutes: v.everyMinutes }).eq("id", id);
    return !res.error;
  },

  async create(kind: WatchKind, title: string, config: Record<string, unknown>, everyMinutes: number, position: number): Promise<string | null> {
    const res = await createClient().from("watch_sources")
      .insert({ kind, title, config: config as Json, every_minutes: everyMinutes, position }).select("id").single();
    return res.data?.id ?? null;
  },

  /** Deletes the source and everything it stored. Not undoable; hiding is the soft option. */
  async remove(id: string): Promise<boolean> {
    // Asking for the deleted row back tells "deleted" apart from "matched nothing".
    const res = await createClient().from("watch_sources").delete().eq("id", id).select("id");
    return !res.error && res.data.length === 1;
  },

  async markSeen(id: string): Promise<void> {
    await createClient().from("watch_sources").update({ seen_at: new Date().toISOString() }).eq("id", id);
  },

  /** Asks the server to fetch this source now. */
  async refresh(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/watch/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const body = (await res.json()) as { results?: { ok: boolean; error?: string }[]; error?: string };
      if (!res.ok) return { ok: false, error: body.error ?? `failed (${res.status})` };
      const r = body.results?.[0];
      return r ? { ok: r.ok, error: r.error } : { ok: true };
    } catch {
      return { ok: false, error: "offline" };
    }
  },

  async transit(id: string, flip: boolean): Promise<TransitSnap | { error: string }> {
    try {
      const res = await fetch(`/api/watch/transit?id=${encodeURIComponent(id)}${flip ? "&flip=1" : ""}`, { cache: "no-store" });
      return (await res.json()) as TransitSnap | { error: string };
    } catch {
      return { error: "offline" };
    }
  },
};

export interface GoogleStatus {
  configured: boolean; // GOOGLE_CLIENT_ID/SECRET set on the server
  connected: boolean;
  email?: string | null;
  /** The grant allows adding and changing events (connected after writes were added). */
  canWrite?: boolean;
  /** The grant allows sending the weekly email from Gmail. */
  canSendMail?: boolean;
  /** The grant allows reading Gmail, for Inbox updates. */
  canReadMail?: boolean;
  calendars: { id: string; name: string; color: string | null; primary: boolean; writable: boolean }[];
  error?: string;
}

/** Google sign-in for the calendar source. The token itself stays on the server. */
export const googleApi = {
  status: async (): Promise<GoogleStatus | null> => {
    const res = await fetch("/api/google/calendars", { cache: "no-store" }).catch(() => null);
    return res?.ok ? ((await res.json()) as GoogleStatus) : null;
  },
  /** Full-page redirect to Google; comes back to `back` with ?google=connected|denied|failed. */
  connect: (back: string) => window.location.assign(`/api/google/connect?next=${encodeURIComponent(back)}`),
  /** Adds, changes or deletes an event; the server refetches the calendar afterwards. */
  event: async (
    op: "create" | "update" | "delete",
    body: {
      sourceId: string; eventId?: string; event: Record<string, unknown>;
      /** Deleting a repeating event: just this occurrence, it and later ones, or all of them. */
      scope?: "one" | "following" | "all"; seriesId?: string; start?: string; allDay?: boolean;
    },
  ): Promise<{ ok: true } | { error: string; reconnect?: boolean }> => {
    const method = op === "create" ? "POST" : op === "update" ? "PATCH" : "DELETE";
    const res = await fetch("/api/google/events", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) return { error: "Couldn't reach the server." };
    const out = (await res.json().catch(() => ({}))) as { ok?: true; error?: string; reconnect?: boolean };
    return res.ok ? { ok: true } : { error: out.error ?? "Failed.", reconnect: out.reconnect };
  },
  disconnect: async () => (await fetch("/api/google/disconnect", { method: "POST" }).catch(() => null))?.ok ?? false,
};
