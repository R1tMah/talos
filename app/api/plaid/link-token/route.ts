import { NextResponse } from "next/server";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { plaidErrorCode } from "@/lib/plaid/client";
import { isUuid, ownerClients } from "@/lib/plaid/route";

/**
 * A Plaid Link token for the Connect button. { kind } connects a new bank: checking
 * (PNC: transactions + balance) or investments (Vanguard: holdings). { id } reopens
 * an existing connection to sign back in ("update mode"), which uses no new Item.
 */
export async function POST(req: Request) {
  const c = await ownerClients();
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; id?: unknown };

  const base: LinkTokenCreateRequest = {
    user: { client_user_id: "talos-owner" },
    client_name: "Talos",
    country_codes: [CountryCode.Us],
    language: "en",
    ...(process.env.PLAID_WEBHOOK_URL ? { webhook: process.env.PLAID_WEBHOOK_URL } : {}),
    // OAuth banks (PNC) return here after their login; must match the Plaid dashboard exactly.
    ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
  };

  let request: LinkTokenCreateRequest;
  if (body.id != null) {
    if (!isUuid(body.id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    const item = await c.admin.from("plaid_items").select("access_token").eq("id", body.id).eq("env", c.env).maybeSingle();
    if (!item.data) return NextResponse.json({ error: "not found" }, { status: 404 });
    request = { ...base, access_token: item.data.access_token };
  } else if (body.kind === "checking") {
    request = { ...base, products: [Products.Transactions], transactions: { days_requested: 730 } };
  } else if (body.kind === "investments") {
    request = { ...base, products: [Products.Investments] };
  } else {
    return NextResponse.json({ error: "kind or id required" }, { status: 400 });
  }

  try {
    const { data } = await c.plaid.linkTokenCreate(request);
    return NextResponse.json({ linkToken: data.link_token });
  } catch (e) {
    console.error(`[plaid] link token failed: ${plaidErrorCode(e) ?? "unknown"}`);
    return NextResponse.json({ error: plaidErrorCode(e) ?? "link token failed" }, { status: 502 });
  }
}
