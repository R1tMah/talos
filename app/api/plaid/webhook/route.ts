import { NextResponse } from "next/server";
import { clients } from "@/lib/plaid/route";
import { syncItem } from "@/lib/plaid/sync";
import { verifyPlaidWebhook } from "@/lib/plaid/webhook";

export const maxDuration = 60;

/**
 * Plaid calls this when new data is ready or a connection needs attention. No session:
 * the proxy lets it through and the signature check here decides. Always answers 200
 * once verified, so Plaid doesn't retry work that already ran.
 */
export async function POST(req: Request) {
  const c = clients();
  if (c instanceof NextResponse) return c;
  const raw = await req.text();
  if (!(await verifyPlaidWebhook(c.plaid, req.headers.get("plaid-verification"), raw))) {
    return NextResponse.json({ error: "unverified" }, { status: 401 });
  }

  const hook = JSON.parse(raw) as { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } | null };
  const item = hook.item_id
    ? (await c.admin.from("plaid_items").select("*").eq("item_id", hook.item_id).eq("env", c.env).maybeSingle()).data
    : null;
  if (!item) return NextResponse.json({ ok: true, ignored: true });

  const code = `${hook.webhook_type}:${hook.webhook_code}`;
  if (code === "TRANSACTIONS:SYNC_UPDATES_AVAILABLE" || code === "HOLDINGS:DEFAULT_UPDATE" || code === "ITEM:LOGIN_REPAIRED") {
    await syncItem(c.admin, c.plaid, item);
  } else if (code === "ITEM:ERROR") {
    const status = hook.error?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
    await c.admin.from("plaid_items").update({ status, error_code: hook.error?.error_code ?? null }).eq("id", item.id);
  } else if (code === "ITEM:PENDING_EXPIRATION" || code === "ITEM:PENDING_DISCONNECT") {
    await c.admin.from("plaid_items").update({ status: "pending_expiration", error_code: hook.webhook_code ?? null }).eq("id", item.id);
  }
  return NextResponse.json({ ok: true });
}
