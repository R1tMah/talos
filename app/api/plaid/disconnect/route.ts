import { NextResponse } from "next/server";
import { isUuid, ownerClients } from "@/lib/plaid/route";

/**
 * Removes a connection: tells Plaid to drop the Item, then deletes it here, which
 * deletes its synced transactions, balances and holdings (hand-entered rows stay).
 * On the Trial plan this doesn't free up a connection slot.
 */
export async function POST(req: Request) {
  const c = await ownerClients();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!isUuid(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = await c.admin.from("plaid_items").select("access_token, env").eq("id", body.id).maybeSingle();
  if (!item.data) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Only this environment's keys can remove it at Plaid; a stale Item from the other env is just deleted here.
  if (item.data.env === c.env) await c.plaid.itemRemove({ access_token: item.data.access_token }).catch(() => {});

  const res = await c.admin.from("plaid_items").delete().eq("id", body.id);
  if (res.error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
