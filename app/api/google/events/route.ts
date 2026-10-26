import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { createEvent, deleteEvent, deleteFollowing, listCalendars, NeedsWriteAccess, seriesIdOf, updateEvent, type EventInput } from "@/lib/google/calendar";
import { refreshWatch } from "@/lib/watch/refresh";
import type { CalendarConfig } from "@/lib/watch/types";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Adds (POST), changes (PATCH) or deletes (DELETE) one event, from the Watch calendar
 * card. The body names the calendar source, whose timezone the times are in; after a
 * write that source is fetched again so the card shows the change.
 *
 * Deleting an occurrence of a repeating event takes a `scope`: "one" (just it, the default),
 * "following" (it and every later one) or "all" (the whole series). The latter two also send
 * the occurrence's `start` and `allDay`, and its `seriesId` when the card has it.
 */
async function handle(req: Request, op: "create" | "update" | "delete") {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    sourceId?: unknown; eventId?: unknown; event?: Partial<EventInput> & { calendarId?: unknown };
    scope?: unknown; seriesId?: unknown; start?: unknown; allDay?: unknown;
  };
  const scope = b.scope ?? "one";
  if (scope !== "one" && scope !== "following" && scope !== "all") return NextResponse.json({ error: "bad scope" }, { status: 400 });
  if (b.seriesId != null && (typeof b.seriesId !== "string" || !/^[a-zA-Z0-9_-]{1,1024}$/.test(b.seriesId))) {
    return NextResponse.json({ error: "bad seriesId" }, { status: 400 });
  }
  if (scope === "following" && (typeof b.start !== "string" || Number.isNaN(Date.parse(b.start)))) {
    return NextResponse.json({ error: "start required" }, { status: 400 });
  }
  if (typeof b.sourceId !== "string") return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  const { data: source } = await admin.from("watch_sources").select("id, kind, config").eq("id", b.sourceId).maybeSingle();
  if (source?.kind !== "calendar") return NextResponse.json({ error: "Not a calendar source." }, { status: 400 });
  const tz = (source.config as unknown as CalendarConfig).timezone;

  const calendarId = typeof b.event?.calendarId === "string" ? b.event.calendarId : null;
  const eventId = typeof b.eventId === "string" ? b.eventId : null;
  if (!calendarId) return NextResponse.json({ error: "calendarId required" }, { status: 400 });
  if (op !== "create" && !eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  try {
    // Only calendars the owner can write to; Google would refuse the others anyway.
    const cal = (await listCalendars(admin)).find((c) => c.id === calendarId);
    if (!cal?.writable) return NextResponse.json({ error: "That calendar is read-only for you." }, { status: 400 });

    const e = b.event as EventInput;
    const input: EventInput = {
      calendarId, title: String(e.title ?? ""), allDay: Boolean(e.allDay), date: String(e.date ?? ""),
      lastDay: e.lastDay ?? null, start: e.start ?? null, end: e.end ?? null, location: e.location ?? null,
    };
    if (op === "create") await createEvent(admin, tz, input);
    else if (op === "update") await updateEvent(admin, tz, eventId!, input);
    else if (scope === "one") await deleteEvent(admin, calendarId, eventId!);
    else {
      const series = seriesIdOf({ eventId: eventId!, seriesId: (b.seriesId as string | undefined) ?? undefined });
      if (scope === "all") await deleteEvent(admin, calendarId, series);
      else await deleteFollowing(admin, calendarId, series, b.start as string, Boolean(b.allDay));
    }

    await refreshWatch(admin, { ids: [source.id], force: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NeedsWriteAccess) return NextResponse.json({ error: err.message, reconnect: true }, { status: 403 });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}

export const POST = (req: Request) => handle(req, "create");
export const PATCH = (req: Request) => handle(req, "update");
export const DELETE = (req: Request) => handle(req, "delete");
