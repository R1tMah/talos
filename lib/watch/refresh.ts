// The Watch refresh job: fetch each source that's due and store what came back.
// Runs server-side with the service-role client (see app/api/watch/refresh).
//
// A failed fetch keeps the last good snapshot and records the error, so the tab shows
// stale data with a link to the original instead of going blank.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { fetchCalendar } from "@/lib/google/calendar";
import { fetchHeadlines, fetchJobs, fetchNews, fetchNewsletter, fetchTeam, fetchWeather } from "./adapters";
import type { CalendarConfig, HeadlinesConfig, JobsConfig, JobsSnap, NewsConfig, NewsletterConfig, TeamConfig, WatchKind, WeatherConfig } from "./types";
import { fallbackLink } from "./types";

type Admin = SupabaseClient<Database>;
type Source = Database["public"]["Tables"]["watch_sources"]["Row"];

// Everything but transit, which is fetched live while its card is open.
const SCHEDULED: ReadonlySet<WatchKind> = new Set(["espn_team", "espn_news", "headlines", "jobs", "weather", "newsletter", "calendar"]);
const SLACK_MS = 2 * 60_000; // cron ticks drift; don't skip a source for being a minute early
const CLOSED_KEPT_DAYS = 30;

export interface RefreshResult { id: string; title: string; ok: boolean; error?: string }

export async function refreshWatch(db: Admin, opts: { ids?: string[]; force?: boolean } = {}): Promise<RefreshResult[]> {
  let q = db.from("watch_sources").select("*");
  q = opts.ids ? q.in("id", opts.ids) : q.eq("enabled", true);
  const { data: sources, error } = await q;
  if (error) throw error;

  const now = Date.now();
  const due = sources.filter(
    (s) => SCHEDULED.has(s.kind as WatchKind) &&
      (opts.force || !s.tried_at || now - Date.parse(s.tried_at) >= s.every_minutes * 60_000 - SLACK_MS),
  );
  return Promise.all(due.map((s) => refreshOne(db, s)));
}

async function refreshOne(db: Admin, s: Source): Promise<RefreshResult> {
  const triedAt = new Date().toISOString();
  try {
    const data = await snapshot(db, s);
    const { error } = await db.from("watch_sources")
      .update({ data: data as unknown as Json, fetched_at: triedAt, tried_at: triedAt, error: null }).eq("id", s.id);
    if (error) throw error;
    return { id: s.id, title: s.title, ok: true };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await db.from("watch_sources").update({ tried_at: triedAt, error: message }).eq("id", s.id);
    return { id: s.id, title: s.title, ok: false, error: message };
  }
}

function snapshot(db: Admin, s: Source): Promise<unknown> {
  const c = s.config as Record<string, unknown>;
  switch (s.kind as WatchKind) {
    case "espn_team": return fetchTeam(c as unknown as TeamConfig);
    case "espn_news": return fetchNews(c as unknown as NewsConfig);
    case "headlines": return fetchHeadlines(c as unknown as HeadlinesConfig);
    case "weather": return fetchWeather(c as unknown as WeatherConfig);
    case "jobs": return storeJobs(db, s, c as unknown as JobsConfig);
    case "newsletter": return fetchNewsletter(c as unknown as NewsletterConfig, s.title);
    case "calendar": return fetchCalendar(db, c as unknown as CalendarConfig);
    default: throw new Error(`${s.kind} isn't fetched on a schedule`);
  }
}

/**
 * Jobs keep one row per posting so the tab can tell what's new since the owner last
 * looked. New matches are inserted (first_seen = now; on the very first fetch, the
 * posting date, so the backlog doesn't all read as new). Postings that left the list
 * or were marked inactive get closed_at. Ones that are still open but no longer match
 * the filters are removed, since they were filtered out, not closed.
 */
async function storeJobs(db: Admin, s: Source, c: JobsConfig): Promise<JobsSnap> {
  const { open, matched } = await fetchJobs(c);
  const firstRun = !s.fetched_at;
  const now = new Date().toISOString();

  const known = new Map<string, string | null>(); // key -> closed_at
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("watch_items").select("key, closed_at").eq("source_id", s.id).range(from, from + 999);
    if (error) throw error;
    for (const r of data) known.set(r.key, r.closed_at);
    if (data.length < 1000) break;
  }

  const inserts = [...matched].filter((k) => !known.has(k)).map((k) => {
    const job = open.get(k)!;
    return { source_id: s.id, key: k, data: job as unknown as Json, first_seen: firstRun ? job.posted : now };
  });
  const reopened = [...matched].filter((k) => known.has(k) && known.get(k) !== null);
  const closed = [...known].filter(([k, at]) => at === null && !open.has(k)).map(([k]) => k);
  const unmatched = [...known.keys()].filter((k) => open.has(k) && !matched.has(k));

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db.from("watch_items").insert(inserts.slice(i, i + 500));
    if (error) throw error;
  }
  const inChunks = async (keys: string[], fn: (chunk: string[]) => PromiseLike<{ error: unknown }>) => {
    for (let i = 0; i < keys.length; i += 200) {
      const { error } = await fn(keys.slice(i, i + 200));
      if (error) throw error;
    }
  };
  await inChunks(reopened, (k) => db.from("watch_items").update({ closed_at: null }).eq("source_id", s.id).in("key", k));
  await inChunks(closed, (k) => db.from("watch_items").update({ closed_at: now }).eq("source_id", s.id).in("key", k));
  await inChunks(unmatched, (k) => db.from("watch_items").delete().eq("source_id", s.id).in("key", k));
  const cutoff = new Date(Date.now() - CLOSED_KEPT_DAYS * 86_400_000).toISOString();
  await db.from("watch_items").delete().eq("source_id", s.id).lt("closed_at", cutoff);

  return { matched: matched.size, active: open.size, link: fallbackLink("jobs", {}) };
}
