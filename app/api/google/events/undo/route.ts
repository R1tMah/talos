import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { deleteEvent, NeedsWriteAccess } from "@/lib/google/calendar";
import { refreshWatch } from "@/lib/watch/refresh";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Undo for an event chat just added: deletes it from Google (a weekly event's whole
 * series). Chat only adds to the primary calendar, so that's the only one this touches.
 * An event that's already gone counts as undone.
 */
export async function POST(req: Request) {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as { calendarId?: unknown; eventId?: unknown };
  if (b.calendarId !== "primary" || typeof b.eventId !== "string" || !/^[a-zA-Z0-9_-]{1,1024}$/.test(b.eventId)) {
    return NextResponse.json({ error: "bad event" }, { status: 400 });
  }
  try {
    await deleteEvent(admin, "primary", b.eventId);
  } catch (err) {
    if (err instanceof NeedsWriteAccess) return NextResponse.json({ error: err.message, reconnect: true }, { status: 403 });
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("no longer exists")) return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
  // Take it off Watch right away.
  const { data: cals } = await admin.from("watch_sources").select("id").eq("kind", "calendar");
  if (cals?.length) await refreshWatch(admin, { ids: cals.map((c) => c.id), force: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
