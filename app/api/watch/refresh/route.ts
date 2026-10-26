import { NextResponse } from "next/server";
import { fromCron } from "@/lib/cronAuth";
import { ownerDb } from "@/lib/agent/server";
import { isScheduled, refreshWatch } from "@/lib/watch/refresh";
import type { WatchKind } from "@/lib/watch/types";
import { createAdminClient } from "@/utils/supabase/admin";

// The job list download is ~13 MB; give the whole refresh room to finish.
export const maxDuration = 60;

/**
 * Refreshes Watch sources. Two callers:
 *   - pg_cron every 15 minutes (Bearer WATCH_CRON_SECRET): whatever is due. Its own
 *     jobs can name a kind ({ kind: "calendar" }, every 5 minutes): every source of it, now.
 *   - the owner's refresh button ({ id } in the body): that source, now.
 * The proxy lets this path through without a session; the checks here decide.
 */
export async function POST(req: Request) {
  let ids: string[] | undefined;
  let kind: WatchKind | undefined;
  let force = false;
  if (fromCron(req)) {
    const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
    if (body.kind != null) {
      if (!isScheduled(body.kind)) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
      kind = body.kind;
      force = true;
    }
  } else {
    if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    ids = [body.id];
    force = true;
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  try {
    const results = await refreshWatch(admin, { ids, kind, force });
    return NextResponse.json({ results });
  } catch (e) {
    console.error(`[watch] refresh failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
