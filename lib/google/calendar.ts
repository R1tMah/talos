// Google sign-in (OAuth) and the Calendar API. Server-side only: the client secret and
// the refresh token never reach the browser. The token lives in public.google_auth,
// which only the service role can read.
//
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a "Web application" OAuth client in
// Google Cloud, with <origin>/api/google/callback as an authorized redirect URI).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDay, dayIn, eventBody, midnightIn, type EventInput } from "@/lib/watch/calendarDays";

export type { EventInput };
import type { CalEvent, CalendarConfig, CalendarSnap } from "@/lib/watch/types";

type Admin = SupabaseClient<Database>;

/** Lets Talos add, change and delete events (calendar.readonly alone only reads). */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", WRITE_SCOPE];
/** True when the stored grant includes writing. Connections made before writes existed don't. */
export const canWrite = (scope: string | null | undefined) => (scope ?? "").split(" ").includes(WRITE_SCOPE);

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 15_000;

/** Carries the sign-in state (CSRF check) and where to return, between /connect and /callback. */
export const STATE_COOKIE = "talos_google_state";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function authUrl(origin: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline", // a refresh token, so the 15-minute refresh works without the owner
    prompt: "consent", // always return a refresh token, even on a reconnect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const out = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok) {
    // invalid_grant: the owner revoked access, or the token expired. Only reconnecting fixes it.
    if (out.error === "invalid_grant") throw new Error("Google sign-in expired. Reconnect Google Calendar in the calendar's settings.");
    throw new Error(`Google sign-in failed: ${out.error ?? res.status}`);
  }
  return out;
}

/** The account's email from the id_token Google just sent us over TLS (no signature check needed). */
function emailOf(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/** Finishes sign-in: trades the code for tokens and stores the refresh token. */
export async function connect(admin: Admin, origin: string, code: string): Promise<void> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token.");
  const { error } = await admin.from("google_auth").upsert({
    id: 1, email: emailOf(t.id_token), scope: t.scope, refresh_token: t.refresh_token, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  cached = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
}

/** Signs out: revokes the token at Google and forgets it here. */
export async function disconnect(admin: Admin): Promise<void> {
  const { data } = await admin.from("google_auth").select("refresh_token").eq("id", 1).maybeSingle();
  if (data) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {});
  }
  const { error } = await admin.from("google_auth").delete().eq("id", 1);
  if (error) throw error;
  cached = null;
}

let cached: { token: string; until: number } | null = null;

/** A current access token, refreshed from the stored refresh token when needed. */
async function accessToken(admin: Admin): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const { data, error } = await admin.from("google_auth").select("refresh_token").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Google Calendar isn't connected. Connect it in the calendar's settings.");
  const t = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
  cached = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  return t.access_token;
}

/** Thrown when the grant is read-only: the owner has to reconnect to allow writing. */
export class NeedsWriteAccess extends Error {
  constructor() {
    super("Reconnect Google Calendar to allow adding and changing events.");
  }
}

async function api<T>(
  admin: Admin, path: string, query: Record<string, string> = {}, init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${API}${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await accessToken(admin)}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) cached = null; // try a fresh token next time
  if (res.status === 403 && init.method && init.method !== "GET") {
    const why = (await res.json().catch(() => ({}))) as { error?: { details?: { reason?: string }[]; errors?: { reason?: string }[] } };
    const reasons = [...(why.error?.details ?? []), ...(why.error?.errors ?? [])].map((d) => d.reason);
    if (reasons.some((r) => r === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || r === "insufficientPermissions")) throw new NeedsWriteAccess();
    throw new Error("Google Calendar refused the change (403). That calendar may be read-only for you.");
  }
  if (res.status === 404 || res.status === 410) throw new Error("That event no longer exists in Google Calendar.");
  if (!res.ok) throw new Error(`Google Calendar returned ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface CalendarListItem {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  /** The owner can add and change events on it (owner or writer access). */
  writable: boolean;
}

interface GCalendarList {
  items: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string }[];
}

/** The account's calendars, primary first, for picking which to show. */
export async function listCalendars(admin: Admin): Promise<CalendarListItem[]> {
  const out = await api<GCalendarList>(admin, "/users/me/calendarList", { minAccessRole: "reader" });
  return out.items
    .map((c) => ({
      id: c.id, name: c.summaryOverride ?? c.summary, color: c.backgroundColor ?? null, primary: Boolean(c.primary),
      writable: c.accessRole === "owner" || c.accessRole === "writer",
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink: string;
  recurringEventId?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

/** Events on the chosen calendars from the start of today through `days` days, soonest first. */
export async function fetchCalendar(admin: Admin, c: CalendarConfig, now = new Date()): Promise<CalendarSnap> {
  if (!c.calendars.length) throw new Error("No calendars picked. Choose some in the calendar's settings.");
  const from = dayIn(c.timezone, now);
  const timeMin = midnightIn(c.timezone, from);
  const timeMax = midnightIn(c.timezone, addDay(from, c.days));
  const colors = new Map((await listCalendars(admin)).map((x) => [x.id, x.color]));

  const lists = await Promise.all(
    c.calendars.map(async (cal) => {
      const out = await api<{ items: GEvent[] }>(admin, `/calendars/${encodeURIComponent(cal.id)}/events`, {
        timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: c.timezone,
      });
      return out.items
        .filter((e) => e.status !== "cancelled")
        .map((e): CalEvent => ({
          id: `${cal.id}:${e.id}`,
          calendarId: cal.id,
          eventId: e.id,
          title: e.summary?.trim() ? e.summary : "(No title)",
          ...(e.summary?.trim() ? {} : { untitled: true as const }),
          ...(e.recurringEventId ? { recurring: true as const } : {}),
          allDay: !e.start.dateTime,
          start: e.start.dateTime ?? e.start.date!,
          end: e.end.dateTime ?? e.end.date!,
          calendar: cal.name,
          color: colors.get(cal.id) ?? null,
          location: e.location ?? null,
          link: e.htmlLink,
        }));
    }),
  );

  // All-day events sort to the start of their day; timed ones by start time.
  const sortKey = (e: CalEvent) => (e.allDay ? midnightIn(c.timezone, e.start) : new Date(e.start).toISOString());
  const events = lists.flat().sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || Number(b.allDay) - Number(a.allDay));
  return { timezone: c.timezone, from, days: c.days, events, link: "https://calendar.google.com/calendar/r" };
}

// ---- Writes ------------------------------------------------------------------------------

const eventsPath = (calendarId: string, eventId?: string) =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

/** Adds an event. Returns its link in Google Calendar. */
export async function createEvent(admin: Admin, tz: string, e: EventInput): Promise<{ id: string; link: string }> {
  const b = eventBody(e, tz);
  if ("error" in b) throw new Error(b.error);
  const out = await api<GEvent>(admin, eventsPath(e.calendarId), {}, { method: "POST", body: b.body });
  return { id: out.id, link: out.htmlLink };
}

/**
 * Changes an event in place. For a repeating event, `eventId` is the one occurrence
 * (Watch fetches with singleEvents), so only that occurrence changes.
 */
export async function updateEvent(admin: Admin, tz: string, eventId: string, e: EventInput): Promise<void> {
  const b = eventBody(e, tz);
  if ("error" in b) throw new Error(b.error);
  await api(admin, eventsPath(e.calendarId, eventId), {}, { method: "PATCH", body: b.body });
}

/** Deletes an event (one occurrence, for a repeating event). */
export async function deleteEvent(admin: Admin, calendarId: string, eventId: string): Promise<void> {
  await api(admin, eventsPath(calendarId, eventId), {}, { method: "DELETE" });
}
