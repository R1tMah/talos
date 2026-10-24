import { NextResponse } from "next/server";
import { isUuid, ownerClients } from "@/lib/plaid/route";
import { syncAll } from "@/lib/plaid/sync";

/** "Sync now": every connection for this environment, or { id } for one. */
export async function POST(req: Request) {
  const c = await ownerClients();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (body.id != null && !isUuid(body.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    return NextResponse.json({ results: await syncAll(c.admin, c.plaid, c.env, body.id ? [body.id as string] : undefined) });
  } catch {
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
