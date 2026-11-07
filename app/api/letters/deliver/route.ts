import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { renderLetter } from "@/lib/email/letter";
import { sendToSelf } from "@/lib/google/gmail";
import { createAdminClient } from "@/utils/supabase/admin";

const fromCron = (req: Request) => {
  const secret = process.env.WATCH_CRON_SECRET;
  const sent = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sent) return false;
  const a = Buffer.from(sent), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

const PER_TICK = 10; // a backlog goes out over a few ticks rather than in one long request

/**
 * Future letters: pg_cron every 15 minutes (Bearer WATCH_CRON_SECRET, only when something
 * is due). Opens letters whose time has come, then emails each opened letter that hasn't
 * been emailed. An email that fails is recorded on the letter and retried next tick; the
 * letter stays open in Talos either way. The proxy lets this path through without a
 * session; the secret check here decides.
 */
export async function POST(req: Request) {
  if (!fromCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });

  await admin.from("future_letters").update({ opened_at: new Date().toISOString() }).is("opened_at", null).lte("deliver_at", new Date().toISOString());

  const [due, settings] = await Promise.all([
    admin.from("future_letters").select("id, body, written_at").not("opened_at", "is", null).is("emailed_at", null)
      .order("deliver_at").limit(PER_TICK),
    admin.from("settings").select("timezone").eq("id", 1).single(),
  ]);
  if (due.error || settings.error) return NextResponse.json({ error: "couldn't read letters" }, { status: 500 });

  let sent = 0;
  for (const letter of due.data) {
    try {
      const mail = renderLetter(letter, settings.data.timezone, new URL(req.url).origin);
      await sendToSelf(admin, mail.subject, mail.text, mail.html);
      await admin.from("future_letters").update({ emailed_at: new Date().toISOString(), email_error: null }).eq("id", letter.id);
      sent++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await admin.from("future_letters").update({ email_error: message }).eq("id", letter.id);
    }
  }
  return NextResponse.json({ sent, failed: due.data.length - sent });
}
