// The Plaid API client, server-only. Keys come from PLAID_CLIENT_ID / PLAID_SECRET and
// PLAID_ENV (sandbox or production); none are ever sent to the browser.

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export type PlaidEnv = "sandbox" | "production";

export function plaidEnv(): PlaidEnv | null {
  const e = process.env.PLAID_ENV?.trim();
  return e === "sandbox" || e === "production" ? e : null;
}

/** Null when Plaid isn't configured (no keys, or PLAID_ENV isn't sandbox/production). */
export function plaidClient(): PlaidApi | null {
  const env = plaidEnv();
  const id = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!env || !id || !secret) return null;
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": id, "PLAID-SECRET": secret } },
    }),
  );
}

/** Plaid's error code from a failed call (axios error with Plaid's JSON body), if any. */
export function plaidErrorCode(e: unknown): string | null {
  const data = (e as { response?: { data?: { error_code?: unknown } } })?.response?.data;
  return typeof data?.error_code === "string" ? data.error_code : null;
}
