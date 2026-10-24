// Plaid responses -> rows in the Finances tables. Pure, so it's tested without Plaid.

/** The parts of a Plaid transaction Finances keeps. */
export interface PlaidTxn {
  transaction_id: string;
  account_id: string;
  amount: number; // Plaid: positive = money out
  date: string;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  personal_finance_category?: { primary: string } | null;
}

export interface PlaidAccount {
  account_id: string;
  type: string;
  subtype?: string | null;
  balances: { available: number | null; current: number | null };
}

export interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_value: number;
}

export interface PlaidSecurity {
  security_id: string;
  name?: string | null;
  ticker_symbol?: string | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** "FOOD_AND_DRINK" -> "Food and drink". */
export function categoryLabel(primary: string | null | undefined) {
  if (!primary) return null;
  const words = primary.toLowerCase().split("_").filter(Boolean).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : null;
}

/** Checking accounts only: savings and others at the same bank aren't part of Finances yet. */
export const checkingAccounts = (accounts: PlaidAccount[]) => accounts.filter((a) => a.type === "depository" && a.subtype === "checking");

/** A finance_transactions row. Finances stores money out as negative, so Plaid's sign flips. */
export function txnRow(t: PlaidTxn, plaidItem: string) {
  return {
    plaid_item: plaidItem,
    plaid_transaction_id: t.transaction_id,
    logical_date: t.date,
    amount: -cents(t.amount),
    description: (t.merchant_name || t.name || "Transaction").trim(),
    category: categoryLabel(t.personal_finance_category?.primary),
    pending: t.pending,
  };
}

/** The checking balance as the bank app shows it (available, falling back to current). Null if none. */
export function checkingBalance(accounts: PlaidAccount[]) {
  const vals = checkingAccounts(accounts)
    .map((a) => a.balances.available ?? a.balances.current)
    .filter((v): v is number => v != null);
  return vals.length ? cents(vals.reduce((x, y) => x + y, 0)) : null;
}

/** vanguard_holdings rows: one per fund per account, keyed so a resync updates the same row. */
export function holdingRows(holdings: PlaidHolding[], securities: PlaidSecurity[], plaidItem: string) {
  const sec = new Map(securities.map((s) => [s.security_id, s]));
  return holdings.map((h) => {
    const s = sec.get(h.security_id);
    const name = s?.name?.trim() || s?.ticker_symbol || "Unknown fund";
    return {
      plaid_item: plaidItem,
      plaid_key: `${h.account_id}:${h.security_id}`,
      fund: s?.ticker_symbol && !name.includes(s.ticker_symbol) ? `${name} (${s.ticker_symbol})` : name,
      shares: Math.round(h.quantity * 10000) / 10000,
      value: cents(h.institution_value),
    };
  });
}

/** The Item status a Plaid error code means. */
export function statusForError(code: string | null | undefined): "login_required" | "error" {
  return code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
}
