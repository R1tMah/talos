// Subscriptions (Finances > Subscriptions): types and the arithmetic the screen and
// the chat tools share. Pure; reads and writes are in lib/subscriptionsData.ts.

export type Cadence = "weekly" | "monthly" | "yearly";
export const CADENCES: Cadence[] = ["monthly", "yearly", "weekly"];

export interface Subscription {
  id: string;
  name: string;
  amount: number; // per billing period
  cadence: Cadence;
  startedOn: string;
  cancelledOn: string | null;
  note: string | null;
}

const PER_MONTH: Record<Cadence, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
const SHORT: Record<Cadence, string> = { weekly: "/wk", monthly: "/mo", yearly: "/yr" };

const cents = (n: number) => Math.round(n * 100) / 100;

/** What one subscription costs per month, whatever its billing period. */
export const perMonth = (s: Pick<Subscription, "amount" | "cadence">) => s.amount * PER_MONTH[s.cadence];

/** "$11.99/mo" */
export const priceLabel = (s: Pick<Subscription, "amount" | "cadence">) => `$${s.amount.toFixed(2)}${SHORT[s.cadence]}`;

export const isActive = (s: Pick<Subscription, "cancelledOn">) => s.cancelledOn == null;

/** Spend across the active subscriptions, as monthly and yearly totals. */
export function spend(subs: Subscription[]) {
  const active = subs.filter(isActive);
  const monthly = active.reduce((sum, s) => sum + perMonth(s), 0);
  return { monthly: cents(monthly), yearly: cents(monthly * 12), active: active.length };
}

// The owner's words for a billing period: "monthly", "$10 a month", "per year", "/yr", "annual", "weekly".
const CADENCE_WORDS: [Cadence, RegExp][] = [
  ["monthly", /\b(monthly|(?:a|per|each|every|\/)\s*(?:month|mo)\b)|\/mo\b/i],
  ["yearly", /\b(yearly|annual(?:ly)?|(?:a|per|each|every|\/)\s*(?:year|yr)\b)|\/yr\b/i],
  ["weekly", /\b(weekly|(?:a|per|each|every|\/)\s*(?:week|wk)\b)|\/wk\b/i],
];

/** The billing period the message names, or null if it names none (or more than one). */
export function cadenceIn(text: string): Cadence | null {
  const hits = CADENCE_WORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
  return hits.length === 1 ? hits[0] : null;
}
