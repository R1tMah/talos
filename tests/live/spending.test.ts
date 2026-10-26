// Live stress test for spending messages: real model, real tool checks, no writes.
// Skipped unless LIVE=1 (npm run test:live). Checks the spending each message becomes,
// and whether chat also logs the food (a priced meal is both) or correctly doesn't.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LIVE = !!process.env.LIVE;
if (LIVE && existsSync(".env.local")) process.loadEnvFile(".env.local");

type Want = { what: string; amount: number; category: string; date?: string };
type Case = { text: string; spends: Want[]; food: boolean | "either" };

// Sunday, Oct 25 2026; yesterday = Oct 24.
const TODAY = "2026-10-25";

const CASES: Case[] = [
  { text: "chipotle bowl $14.50", spends: [{ what: "chipotle", amount: 14.5, category: "Food & drink" }], food: true },
  { text: "uber home 18.40", spends: [{ what: "uber", amount: 18.4, category: "Transport" }], food: false },
  { text: "paid 40 for the textbook yesterday", spends: [{ what: "textbook", amount: 40, category: "School", date: "2026-10-24" }], food: false },
  {
    text: "bought a hoodie for $55 and groceries at trader joes for $63.20",
    spends: [{ what: "hoodie", amount: 55, category: "Shopping" }, { what: "groceries", amount: 63.2, category: "Groceries" }],
    food: false,
  },
  { text: "movie tickets were $15", spends: [{ what: "movie", amount: 15, category: "Entertainment" }], food: false },
  { text: "spent $6.75 on an iced latte", spends: [{ what: "latte", amount: 6.75, category: "Food & drink" }], food: true },
  { text: "spent $12 on lunch", spends: [{ what: "lunch", amount: 12, category: "Food & drink" }], food: "either" }, // "lunch" alone may not be loggable food
  { text: "cvs, cold medicine $11.29", spends: [{ what: "medicine", amount: 11.29, category: "Health" }], food: false },
  { text: "had a chipotle bowl for lunch", spends: [], food: true }, // no price: food only
  { text: "subscribed to spotify premium $11.99 a month", spends: [], food: false }, // a subscription, not spending
];

describe.skipIf(!LIVE)("spending messages through the real model", () => {
  it.each(CASES.map((c) => [c.text, c] as const))("%s", async (_, c) => {
    const { callModel } = await import("@/lib/agent/run");
    const { TOOLS } = await import("@/lib/agent/tools");
    const { fakeDb } = await import("../helpers/fakeDb");
    const ctx = { db: fakeDb().db, text: c.text, today: TODAY, clock: "13:00", meals: [], foods: [] };

    const calls = (await callModel(ctx)) ?? [];
    const spends: Record<string, unknown>[] = [];
    for (const call of calls.filter((x) => x.name === "log_spending")) {
      const check = await TOOLS.log_spending.check!(call.input, ctx);
      spends.push({ status: check.status, ...("resolved" in check ? check.resolved : {}) } as Record<string, unknown>);
    }
    const food = calls.some((x) => x.name === "log_food" || x.name === "log_saved_meal");
    const report = JSON.stringify({ calls, spends }, null, 1);

    expect(spends.length, report).toBe(c.spends.length);
    c.spends.forEach((w, i) => {
      const s = spends.find((x) => String(x.what).toLowerCase().includes(w.what)) ?? spends[i];
      expect(s.status, report).toBe("ready");
      expect(String(s.what).toLowerCase(), report).toContain(w.what);
      expect(s.amount, report).toBe(w.amount);
      expect(s.category, report).toBe(w.category);
      expect(s.date, report).toBe(w.date ?? TODAY);
    });
    if (c.food !== "either") expect(food, report).toBe(c.food);
  }, 60_000);
});
