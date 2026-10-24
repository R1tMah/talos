// Plaid -> Finances mapping, and webhook signature checks (with a locally generated key).

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PlaidApi } from "plaid";
import { categoryLabel, checkingBalance, holdingRows, statusForError, txnRow, type PlaidAccount } from "@/lib/plaid/map";
import { verifyPlaidWebhook } from "@/lib/plaid/webhook";

describe("transactions", () => {
  it("flips Plaid's sign (positive = money out), prefers the merchant name, labels the category", () => {
    expect(txnRow({
      transaction_id: "t1", account_id: "a1", amount: 12.35, date: "2026-10-22", name: "SQ *CHIPOTLE 1234",
      merchant_name: "Chipotle", pending: true, personal_finance_category: { primary: "FOOD_AND_DRINK" },
    }, "item-1")).toEqual({
      plaid_item: "item-1", plaid_transaction_id: "t1", logical_date: "2026-10-22", amount: -12.35,
      description: "Chipotle", category: "Food and drink", pending: true,
    });
  });

  it("money in is positive; falls back to the raw name; no category is null", () => {
    const r = txnRow({ transaction_id: "t2", account_id: "a1", amount: -800, date: "2026-10-20", name: " PAYROLL ", pending: false }, "i");
    expect(r).toMatchObject({ amount: 800, description: "PAYROLL", category: null, pending: false });
  });

  it("category labels", () => {
    expect(categoryLabel("TRANSFER_IN")).toBe("Transfer in");
    expect(categoryLabel("")).toBeNull();
    expect(categoryLabel(null)).toBeNull();
  });
});

describe("balances", () => {
  const acct = (subtype: string, available: number | null, current: number | null, type = "depository"): PlaidAccount =>
    ({ account_id: subtype, type, subtype, balances: { available, current } });

  it("uses checking accounts only, available balance first", () => {
    expect(checkingBalance([acct("checking", 110, 100), acct("savings", 5000, 5000)])).toBe(110);
    expect(checkingBalance([acct("checking", null, 100.004)])).toBe(100);
    expect(checkingBalance([acct("savings", 1, 1), acct("checking", null, null)])).toBeNull();
    expect(checkingBalance([acct("checking", 50, 50, "credit")])).toBeNull();
  });
});

describe("holdings", () => {
  it("one row per fund per account, named with its ticker, keyed for resync", () => {
    const rows = holdingRows(
      [
        { account_id: "acc", security_id: "s1", quantity: 10.123456, institution_value: 1500.006 },
        { account_id: "acc", security_id: "s2", quantity: 3, institution_value: 300 },
        { account_id: "acc", security_id: "missing", quantity: 1, institution_value: 1 },
      ],
      [
        { security_id: "s1", name: "Vanguard Total Stock Market Index Fund Admiral Shares", ticker_symbol: "VTSAX" },
        { security_id: "s2", name: "VTI", ticker_symbol: "VTI" },
      ],
      "item-2",
    );
    expect(rows).toEqual([
      { plaid_item: "item-2", plaid_key: "acc:s1", fund: "Vanguard Total Stock Market Index Fund Admiral Shares (VTSAX)", shares: 10.1235, value: 1500.01 },
      { plaid_item: "item-2", plaid_key: "acc:s2", fund: "VTI", shares: 3, value: 300 },
      { plaid_item: "item-2", plaid_key: "acc:missing", fund: "Unknown fund", shares: 1, value: 1 },
    ]);
  });

  it("error codes -> connection status", () => {
    expect(statusForError("ITEM_LOGIN_REQUIRED")).toBe("login_required");
    expect(statusForError("INSTITUTION_DOWN")).toBe("error");
  });
});

describe("webhook verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const plaid = { webhookVerificationKeyGet: async () => ({ data: { key: { ...jwk, alg: "ES256", kid: "k1" } } }) } as unknown as PlaidApi;
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const NOW = 1_800_000_000_000;

  function jwt(body: string, { iat = NOW / 1000, alg = "ES256", kid = "k1" } = {}) {
    const head = enc({ alg, kid, typ: "JWT" });
    const payload = enc({ iat, request_body_sha256: createHash("sha256").update(body).digest("hex") });
    const sig = sign("sha256", Buffer.from(`${head}.${payload}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
    return `${head}.${payload}.${sig}`;
  }
  const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "x" });

  it("accepts a fresh, correctly signed webhook for this exact body", async () => {
    expect(await verifyPlaidWebhook(plaid, jwt(body), body, NOW)).toBe(true);
  });

  it("rejects a changed body, a stale token, a missing header, another alg, or a bad signature", async () => {
    expect(await verifyPlaidWebhook(plaid, jwt(body), body.replace("x", "y"), NOW)).toBe(false);
    expect(await verifyPlaidWebhook(plaid, jwt(body, { iat: NOW / 1000 - 600 }), body, NOW)).toBe(false);
    expect(await verifyPlaidWebhook(plaid, null, body, NOW)).toBe(false);
    expect(await verifyPlaidWebhook(plaid, jwt(body, { alg: "HS256" }), body, NOW)).toBe(false);
    const t = jwt(body);
    expect(await verifyPlaidWebhook(plaid, `${t.slice(0, -4)}AAAA`, body, NOW)).toBe(false);
    expect(await verifyPlaidWebhook(plaid, "not.a.jwt.at.all", body, NOW)).toBe(false);
  });
});
