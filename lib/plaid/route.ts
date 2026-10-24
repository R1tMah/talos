// Shared setup for the /api/plaid routes: the owner check and the server-side clients.

import { NextResponse } from "next/server";
import type { PlaidApi } from "plaid";
import { ownerDb } from "@/lib/agent/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { plaidClient, plaidEnv, type PlaidEnv } from "./client";

type Ready = { admin: NonNullable<ReturnType<typeof createAdminClient>>; plaid: PlaidApi; env: PlaidEnv };

/** The service-role client and Plaid, or the error response to return instead. */
export function clients(): Ready | NextResponse {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const plaid = plaidClient();
  const env = plaidEnv();
  if (!plaid || !env) return NextResponse.json({ error: "Plaid is not configured" }, { status: 500 });
  return { admin, plaid, env };
}

/** Same as clients(), for routes only the signed-in owner may call. */
export async function ownerClients(): Promise<Ready | NextResponse> {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return clients();
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
