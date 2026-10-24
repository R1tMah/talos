import { NextResponse } from "next/server";
import { plaidErrorCode } from "@/lib/plaid/client";
import { ownerClients } from "@/lib/plaid/route";
import { syncItem } from "@/lib/plaid/sync";

/**
 * After the owner finishes Plaid Link: swaps the one-time public token for the Item's
 * access token, stores it server-side, and runs the first sync.
 */
export async function POST(req: Request) {
  const c = await ownerClients();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { publicToken?: unknown; kind?: unknown; institution?: unknown };
  if (typeof body.publicToken !== "string" || (body.kind !== "checking" && body.kind !== "investments")) {
    return NextResponse.json({ error: "publicToken and kind required" }, { status: 400 });
  }

  let exchanged;
  try {
    ({ data: exchanged } = await c.plaid.itemPublicTokenExchange({ public_token: body.publicToken }));
  } catch (e) {
    return NextResponse.json({ error: plaidErrorCode(e) ?? "exchange failed" }, { status: 502 });
  }

  const saved = await c.admin.from("plaid_items").insert({
    item_id: exchanged.item_id,
    access_token: exchanged.access_token,
    env: c.env,
    kind: body.kind,
    institution_name: typeof body.institution === "string" ? body.institution.slice(0, 100) : null,
  }).select("*").single();
  if (saved.error) return NextResponse.json({ error: "save failed" }, { status: 500 });

  // New Items may not have transactions ready yet; the webhook (or Sync now) picks them up.
  const result = await syncItem(c.admin, c.plaid, saved.data);
  return NextResponse.json({ id: saved.data.id, result });
}
