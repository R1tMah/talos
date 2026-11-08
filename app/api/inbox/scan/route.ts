import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { classify } from "@/lib/agent/inbox";
import { ownerDb } from "@/lib/agent/server";
import { NeedsReadAccess, readMail, searchMail } from "@/lib/google/gmail";
import { canReadMail } from "@/lib/google/calendar";
import { inboxQuery, matchApplication, proposal, type AppRow } from "@/lib/inbox";
import { createAdminClient } from "@/utils/supabase/admin";

const fromCron = (req: Request) => {
  const secret = process.env.WATCH_CRON_SECRET;
  const sent = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sent) return false;
  const a = Buffer.from(sent), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

const PER_SCAN = 25; // new emails classified per run; any more wait for the next one
const OVERLAP_MS = 30 * 60_000; // re-search the last half hour: mail can land late; seen ids are skipped

/**
 * Inbox updates: finds application emails that arrived since the last scan, has Claude
 * label each new one, and saves a pending update for each that would change Applications.
 * Nothing in Applications changes here; the owner confirms each one in the banner.
 *
 * Callers: pg_cron every 15 minutes (Bearer WATCH_CRON_SECRET) and the owner's "Scan now".
 * The proxy lets this path through without a session; the checks here decide.
 */
export async function POST(req: Request) {
  const cron = fromCron(req);
  if (!cron && !(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });

  const [state, google] = await Promise.all([
    admin.from("inbox_scan").select("*").eq("id", 1).single(),
    admin.from("google_auth").select("scope").eq("id", 1).maybeSingle(),
  ]);
  if (state.error) return NextResponse.json({ error: "couldn't read the scan settings" }, { status: 500 });
  if (cron && !state.data.enabled) return NextResponse.json({ scanned: 0, why: "off" });
  const fail = async (message: string, status = 200) => {
    await admin.from("inbox_scan").update({ last_error: message.slice(0, 300) }).eq("id", 1);
    return NextResponse.json({ error: message }, { status });
  };
  if (!google.data) return fail("Google isn't connected.");
  if (!canReadMail(google.data.scope)) return fail(new NeedsReadAccess().message);

  const started = new Date();
  const since = new Date(Math.max(
    new Date(state.data.started_at).getTime(),
    state.data.last_scanned_at ? new Date(state.data.last_scanned_at).getTime() - OVERLAP_MS : 0,
  ));

  try {
    const ids = await searchMail(admin, inboxQuery(since), 100);
    const seen = ids.length
      ? new Set(((await admin.from("inbox_messages").select("message_id").in("message_id", ids)).data ?? []).map((r) => r.message_id))
      : new Set<string>();
    const fresh = ids.filter((id) => !seen.has(id));
    const batch = fresh.slice(-PER_SCAN).reverse(); // oldest first, so updates arrive in order

    const apps = ((await admin.from("applications").select("id, company, position, status, applied_date").is("deleted_at", null)).data ?? []) as AppRow[];
    let proposed = 0;
    let unfinished = fresh.length > batch.length;

    for (const id of batch) {
      const mail = await readMail(admin, id);
      // An email from before the scan started (Gmail's after: is by day) is left alone.
      if (mail.date < new Date(state.data.started_at)) {
        await admin.from("inbox_messages").insert({ message_id: id, received_at: mail.date.toISOString(), kind: "irrelevant" });
        continue;
      }
      const label = await classify(admin, mail);
      if (!label) {
        unfinished = true; // the model was unreachable: try this one again next run
        continue;
      }
      const { error } = await admin.from("inbox_messages").insert({ message_id: id, received_at: mail.date.toISOString(), kind: label.kind });
      if (error) continue; // another run got to it first
      if (label.kind === "irrelevant" || !label.company) continue;

      const app = matchApplication(apps, label.company, label.role);
      const p = proposal(label.kind, app);
      if (!p) continue;
      await admin.from("pending_inbox_updates").insert({
        message_id: id, kind: label.kind, company: app?.company ?? label.company, role: label.role ?? app?.position ?? null,
        email_date: mail.date.toISOString().slice(0, 10), subject: mail.subject.slice(0, 300), sender: mail.from.slice(0, 200),
        application_id: p.applicationId, proposed_status: p.status,
      });
      proposed++;
    }

    // Move the window forward only when everything in it was handled.
    await admin.from("inbox_scan").update({ ...(unfinished ? {} : { last_scanned_at: started.toISOString() }), last_error: null }).eq("id", 1);
    return NextResponse.json({ found: ids.length, new: fresh.length, scanned: batch.length, proposed, more: unfinished });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), cron ? 500 : 502);
  }
}
