import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { gather, isDue, render, type Section } from "@/lib/email/weekly";
import { NeedsMailAccess, sendToSelf } from "@/lib/google/gmail";
import { createAdminClient } from "@/utils/supabase/admin";

const fromCron = (req: Request) => {
  const secret = process.env.WATCH_CRON_SECRET;
  const sent = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sent) return false;
  const a = Buffer.from(sent), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The weekly email. Two callers:
 *   - pg_cron every 15 minutes (Bearer WATCH_CRON_SECRET): sends if it's Sunday 1 PM
 *     or later where the owner is and it hasn't gone out today.
 *   - the owner's "Send test email" button: sends now, without counting as this week's.
 * The proxy lets this path through without a session; the checks here decide.
 */
export async function POST(req: Request) {
  const cron = fromCron(req);
  if (!cron && !(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });

  const [cfg, settings] = await Promise.all([
    admin.from("weekly_email").select("*").eq("id", 1).single(),
    admin.from("settings").select("timezone").eq("id", 1).single(),
  ]);
  if (cfg.error || settings.error) return NextResponse.json({ error: "couldn't read settings" }, { status: 500 });
  const tz = settings.data.timezone;

  let sunday: string | null = null;
  if (cron) {
    if (!cfg.data.enabled) return NextResponse.json({ sent: false, why: "off" });
    const due = isDue(tz, cfg.data.last_sent_on);
    if (!due.due) return NextResponse.json({ sent: false, why: "not due" });
    sunday = due.sunday;
  }

  try {
    const data = await gather(admin, cfg.data.sections as Section[], tz);
    const mail = render(data, new URL(req.url).origin);
    await sendToSelf(admin, cron ? mail.subject : `[Test] ${mail.subject}`, mail.text, mail.html);
    if (sunday) await admin.from("weekly_email").update({ last_sent_on: sunday, last_error: null }).eq("id", 1);
    return NextResponse.json({ sent: true });
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    // Not marked sent: the next tick tries again. The error shows in Settings.
    if (cron) await admin.from("weekly_email").update({ last_error: message }).eq("id", 1);
    return NextResponse.json({ error: message, reconnect: e instanceof NeedsMailAccess }, { status: cron ? 500 : 502 });
  }
}
