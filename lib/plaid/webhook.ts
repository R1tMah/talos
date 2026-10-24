// Verifies that a webhook really came from Plaid: the Plaid-Verification header is an
// ES256 JWT signed with a key Plaid publishes, carrying the SHA-256 of the exact body.
// https://plaid.com/docs/api/webhooks/webhook-verification/

import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type { PlaidApi } from "plaid";

const MAX_AGE_SEC = 5 * 60;
const keys = new Map<string, JsonWebKey>(); // by key id; Plaid rotates rarely

const b64url = (s: string) => Buffer.from(s, "base64url");
const json = (s: string) => JSON.parse(b64url(s).toString("utf8")) as Record<string, unknown>;

export async function verifyPlaidWebhook(plaid: PlaidApi, jwt: string | null, rawBody: string, now = Date.now()): Promise<boolean> {
  if (!jwt) return false;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = json(parts[0]);
    if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

    let jwk = keys.get(header.kid);
    if (!jwk) {
      const { data } = await plaid.webhookVerificationKeyGet({ key_id: header.kid });
      jwk = data.key as unknown as JsonWebKey;
      keys.set(header.kid, jwk);
    }
    const signed = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
      b64url(parts[2]),
    );
    if (!signed) return false;

    const claims = json(parts[1]);
    if (typeof claims.iat !== "number" || now / 1000 - claims.iat > MAX_AGE_SEC) return false;
    const want = Buffer.from(String(claims.request_body_sha256 ?? ""), "utf8");
    const got = Buffer.from(createHash("sha256").update(rawBody).digest("hex"), "utf8");
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}
