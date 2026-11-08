import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { canReadMail, canSendMail, canWrite, googleConfigured, listCalendars } from "@/lib/google/calendar";
import { createAdminClient } from "@/utils/supabase/admin";

/** Whether Google is connected, as whom, and the account's calendars (for picking which to show). */
export async function GET() {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ configured: false, connected: false, calendars: [] });

  const { data: status } = await db.rpc("google_status");
  const account = status?.[0];
  if (!account) return NextResponse.json({ configured: true, connected: false, calendars: [] });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const grants = {
    canWrite: canWrite(account.scope), canSendMail: canSendMail(account.scope), canReadMail: canReadMail(account.scope),
  };
  try {
    return NextResponse.json({ configured: true, connected: true, email: account.email, ...grants, calendars: await listCalendars(admin) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ configured: true, connected: true, email: account.email, ...grants, calendars: [], error: message.slice(0, 300) });
  }
}
