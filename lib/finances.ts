// Finances: types and the arithmetic the screen and Tabs card share. Pure; the
// Supabase reads and writes are in lib/financesData.ts.

export interface Transaction {
  id: string;
  date: string;
  time: string; // entry time, for ordering within a day
  amount: number; // negative = spent, positive = received
  description: string;
  category: string | null;
  note: string | null;
  pending: boolean; // Plaid: not posted yet, may still change
  synced: boolean; // from Plaid rather than entered by hand
}

export interface BalanceReading {
  id: string;
  date: string;
  balance: number;
}

export interface Holding {
  id: string;
  fund: string;
  shares: number;
  value: number;
  updatedAt: string;
  synced: boolean;
}

/** A Plaid bank connection as the app may see it (never the token). */
export interface Connection {
  id: string;
  env: "sandbox" | "production";
  kind: "checking" | "investments";
  institution: string | null;
  status: "ok" | "login_required" | "pending_expiration" | "error";
  errorCode: string | null;
  lastSyncedAt: string | null;
}

/** "$1,234.56", "−$12.00" (a real minus sign), "+$50.00" with `sign`. */
export function fmtMoney(n: number, opts: { sign?: boolean; cents?: boolean } = {}) {
  const cents = opts.cents ?? true;
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  if (n < 0) return `−$${abs}`;
  return `${opts.sign && n > 0 ? "+" : ""}$${abs}`;
}

/** The Vanguard total: the sum of its holdings. Null with no holdings entered. */
export const vanguardTotal = (holdings: Pick<Holding, "value">[]) =>
  holdings.length ? Math.round(holdings.reduce((a, h) => a + h.value, 0) * 100) / 100 : null;

/** Money out and in over the transactions from `from` (inclusive) on. Out is positive. */
export function flow(txns: Transaction[], from: string) {
  let out = 0;
  let inn = 0;
  for (const t of txns) {
    if (t.date < from) continue;
    if (t.amount < 0) out -= t.amount;
    else inn += t.amount;
  }
  return { out: Math.round(out * 100) / 100, in: Math.round(inn * 100) / 100 };
}

/** First day of the month a date falls in. */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
