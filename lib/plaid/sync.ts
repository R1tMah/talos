// Pulls one Plaid Item's latest data into the Finances tables. Server-only: it runs
// with the service-role client (the access token is unreadable to the owner's session).

import type { PlaidApi, Transaction, RemovedTransaction, AccountBase } from "plaid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logicalDateIn } from "@/lib/date";
import { plaidErrorCode, type PlaidEnv } from "./client";
import { checkingAccounts, checkingBalance, holdingRows, statusForError, txnRow, type PlaidAccount } from "./map";

type Admin = SupabaseClient<Database>;
type Item = Database["public"]["Tables"]["plaid_items"]["Row"];

export interface SyncResult {
  id: string;
  ok: boolean;
  status: Item["status"];
  added?: number;
  modified?: number;
  removed?: number;
  holdings?: number;
  error?: string;
}

async function today(db: Admin) {
  const s = await db.from("settings").select("timezone").eq("id", 1).single();
  return logicalDateIn(s.data?.timezone ?? "America/New_York");
}

/** Records today's checking balance from this Item: one reading per day, updated in place. */
async function saveBalance(db: Admin, item: Item, accounts: PlaidAccount[]) {
  const balance = checkingBalance(accounts);
  if (balance == null) return;
  const day = await today(db);
  const prev = await db.from("checking_balances").select("id").eq("plaid_item", item.id).eq("logical_date", day)
    .is("deleted_at", null).maybeSingle();
  const res = prev.data
    ? await db.from("checking_balances").update({ balance }).eq("id", prev.data.id)
    : await db.from("checking_balances").insert({ plaid_item: item.id, logical_date: day, balance });
  if (res.error) throw new Error(`balance: ${res.error.message}`);
}

/** /transactions/sync from the stored cursor; restarts the pass if Plaid's data shifts mid-way. */
async function pullTransactions(plaid: PlaidApi, item: Item) {
  for (let attempt = 0; ; attempt++) {
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: RemovedTransaction[] = [];
    let accounts: AccountBase[] = [];
    let cursor = item.cursor ?? undefined;
    try {
      for (;;) {
        const { data } = await plaid.transactionsSync({ access_token: item.access_token, cursor, count: 500 });
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        accounts = data.accounts;
        cursor = data.next_cursor;
        if (!data.has_more) return { added, modified, removed, accounts, cursor };
      }
    } catch (e) {
      if (plaidErrorCode(e) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt < 3) continue;
      throw e;
    }
  }
}

async function syncChecking(db: Admin, plaid: PlaidApi, item: Item): Promise<Partial<SyncResult>> {
  const { added, modified, removed, accounts, cursor } = await pullTransactions(plaid, item);
  const checking = new Set(checkingAccounts(accounts as PlaidAccount[]).map((a) => a.account_id));
  const rows = [...added, ...modified].filter((t) => checking.has(t.account_id)).map((t) => txnRow(t, item.id));

  if (rows.length) {
    // A synced row the owner deleted stays deleted: deleted_at isn't in the upsert.
    const res = await db.from("finance_transactions").upsert(rows, { onConflict: "plaid_transaction_id" });
    if (res.error) throw new Error(`transactions: ${res.error.message}`);
  }
  const gone = removed.map((r) => r.transaction_id).filter(Boolean) as string[];
  if (gone.length) {
    const res = await db.from("finance_transactions").delete().in("plaid_transaction_id", gone).eq("plaid_item", item.id);
    if (res.error) throw new Error(`removed: ${res.error.message}`);
  }
  await saveBalance(db, item, accounts as PlaidAccount[]);
  // The cursor moves only after everything above is saved, so a failure re-pulls the same changes.
  const res = await db.from("plaid_items").update({ cursor }).eq("id", item.id);
  if (res.error) throw new Error(`cursor: ${res.error.message}`);
  return { added: added.length, modified: modified.length, removed: gone.length };
}

async function syncInvestments(db: Admin, plaid: PlaidApi, item: Item): Promise<Partial<SyncResult>> {
  const { data } = await plaid.investmentsHoldingsGet({ access_token: item.access_token });
  const rows = holdingRows(data.holdings, data.securities, item.id).map((r) => ({ ...r, deleted_at: null, updated_at: new Date().toISOString() }));
  if (rows.length) {
    const res = await db.from("vanguard_holdings").upsert(rows, { onConflict: "plaid_item,plaid_key" });
    if (res.error) throw new Error(`holdings: ${res.error.message}`);
  }
  // Funds no longer held drop off (synced rows only; hand-entered ones are left alone).
  const keep = rows.map((r) => r.plaid_key);
  let stale = db.from("vanguard_holdings").update({ deleted_at: new Date().toISOString() }).eq("plaid_item", item.id).is("deleted_at", null);
  if (keep.length) stale = stale.not("plaid_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  const res = await stale;
  if (res.error) throw new Error(`stale holdings: ${res.error.message}`);
  return { holdings: rows.length };
}

/** Syncs one Item and records how it went. Never throws: failures come back in the result. */
export async function syncItem(db: Admin, plaid: PlaidApi, item: Item): Promise<SyncResult> {
  try {
    const out = item.kind === "investments" ? await syncInvestments(db, plaid, item) : await syncChecking(db, plaid, item);
    await db.from("plaid_items").update({ status: "ok", error_code: null, last_synced_at: new Date().toISOString() }).eq("id", item.id);
    return { id: item.id, ok: true, status: "ok", ...out };
  } catch (e) {
    const code = plaidErrorCode(e);
    const status = code ? statusForError(code) : "error";
    await db.from("plaid_items").update({ status, error_code: code ?? "SYNC_FAILED" }).eq("id", item.id);
    console.error(`[plaid] sync ${item.kind} failed: ${code ?? (e instanceof Error ? e.message : String(e))}`.slice(0, 300));
    return { id: item.id, ok: false, status, error: code ?? "sync failed" };
  }
}

/** Every Item for the current environment (or just `ids`). Sandbox Items are skipped in production and back. */
export async function syncAll(db: Admin, plaid: PlaidApi, env: PlaidEnv, ids?: string[]) {
  let q = db.from("plaid_items").select("*").eq("env", env);
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return Promise.all(data.map((item) => syncItem(db, plaid, item)));
}
