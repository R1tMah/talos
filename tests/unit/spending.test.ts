// Spending tracking: month math for the Finances view, and the chat tool's checks.

import { describe, expect, it } from "vitest";
import { TOOLS } from "@/lib/agent/tools";
import { monthLabel, monthSummary, shiftMonth, type Spend } from "@/lib/spending";
import { ctxFor, fakeDb } from "../helpers/fakeDb";

const spend = (date: string, amount: number, category: Spend["category"], what = "x"): Spend =>
  ({ id: `${date}-${amount}-${what}`, date, time: "12:00", amount, what, category, note: null });

describe("months", () => {
  it("labels and steps across years", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("this month: total, count, per day so far, categories largest first", () => {
    const rows = [
      spend("2026-10-02", 14.5, "Food & drink"), spend("2026-10-05", 63.2, "Groceries"), spend("2026-10-09", 9.75, "Food & drink"),
      spend("2026-10-10", 18.4, "Transport"), spend("2026-09-30", 500, "Shopping"),
    ];
    const m = monthSummary(rows, "2026-10", "2026-10-10", "");
    expect(m.total).toBe(105.85);
    expect(m.count).toBe(4);
    expect(m.perDay).toBe(10.59); // 105.85 over 10 days so far
    expect(m.categories.map((c) => [c.category, c.amount])).toEqual([["Groceries", 63.2], ["Food & drink", 24.25], ["Transport", 18.4]]);
    expect(m.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1);
  });

  it("a past month averages over all its days; an empty month has no shares", () => {
    expect(monthSummary([spend("2026-09-30", 300, "Shopping")], "2026-09", "2026-10-10", "").perDay).toBe(10);
    expect(monthSummary([], "2026-10", "2026-10-10", "")).toMatchObject({ total: 0, count: 0, categories: [] });
  });

  it("drops entries before tracking began and counts days from then", () => {
    const rows = [spend("2026-10-02", 500, "Shopping"), spend("2026-10-25", 12, "Groceries"), spend("2026-10-31", 2, "Other")];
    expect(monthSummary(rows.slice(0, 2), "2026-10", "2026-10-25")).toMatchObject({ total: 12, count: 1, perDay: 12 }); // day 1
    expect(monthSummary(rows, "2026-10", "2026-11-03")).toMatchObject({ total: 14, count: 2, perDay: 2 }); // over Oct 25–31
    expect(monthSummary(rows, "2026-09", "2026-10-25")).toMatchObject({ total: 0, count: 0, perDay: null });
  });
});

describe("log_spending checks", () => {
  const check = (text: string, input: Record<string, unknown>) =>
    TOOLS.log_spending.check!({ days_ago: null, confidence: 0.95, ...input }, ctxFor(text, fakeDb().db));

  it("takes the typed amount, the owner's words and the category", async () => {
    const c = await check("chipotle bowl $14.50", { amount: 14.5, what: "chipotle bowl", category: "Food & drink" });
    expect(c).toMatchObject({ status: "ready", resolved: { amount: 14.5, what: "chipotle bowl", category: "Food & drink", date: "2026-10-11" }, warnings: [] });
  });

  it("an amount the owner didn't type is asked for, never estimated", async () => {
    const c = await check("grabbed chipotle", { amount: 12, what: "chipotle", category: "Food & drink" });
    expect(c).toMatchObject({ status: "missing", missing: [{ name: "amount" }] });
  });

  it("an unknown category falls back to Other; yesterday is a day back", async () => {
    const c = await check("paid 40 for parking yesterday", { amount: 40, what: "parking", category: "Car stuff", days_ago: 1 });
    expect(c).toMatchObject({ status: "ready", resolved: { category: "Other", date: "2026-10-10" } });
  });

  it("a big purchase asks first; a made-up description is refused", async () => {
    expect(await check("new laptop $1400", { amount: 1400, what: "new laptop", category: "Shopping" })).toMatchObject({ warnings: [expect.stringMatching(/a lot/)] });
    expect(await check("spent $5", { amount: 5, what: "coffee", category: "Food & drink" })).toMatchObject({ status: "invalid" });
  });

  it("filling in the amount", () => {
    const fill = TOOLS.log_spending.fill!;
    expect(fill({ what: "x", amount: null, category: "Other", date: "2026-10-11" }, { amount: "7.456" })).toMatchObject({ amount: 7.46 });
    expect(fill({ what: "x", amount: null, category: "Other", date: "2026-10-11" }, { amount: "0" })).toBe("Amount must be more than 0.");
  });
});

describe("rolling 30 days", () => {
  it("the window ends today and spans months; per day is over all 30 days", async () => {
    const { rollingStart, rollingSummary } = await import("@/lib/spending");
    expect(rollingStart("2026-10-25", 30, "")).toBe("2026-09-26");
    expect(rollingStart("2026-03-10", 30, "")).toBe("2026-02-09");
    const rows = [
      spend("2026-09-25", 100, "Shopping"), // one day too early
      spend("2026-09-26", 30, "Groceries"), // first day in
      spend("2026-10-25", 15, "Food & drink"), // today
      spend("2026-10-26", 999, "Shopping"), // future, not counted
    ];
    const r = rollingSummary(rows, "2026-10-25", 30, "");
    expect(r).toMatchObject({ from: "2026-09-26", days: 30, total: 45, count: 2, perDay: 1.5 });
    expect(r.categories.map((c) => c.category)).toEqual(["Groceries", "Food & drink"]);
  });

  it("starts no earlier than tracking began; per day is over the days so far", async () => {
    const { rollingStart, rollingSummary } = await import("@/lib/spending");
    const rows = [spend("2026-10-24", 500, "Shopping"), spend("2026-10-25", 10, "Groceries"), spend("2026-10-27", 20, "Food & drink")];
    expect(rollingSummary(rows, "2026-10-25")).toMatchObject({ from: "2026-10-25", days: 1, total: 10, perDay: 10 });
    expect(rollingSummary(rows, "2026-10-27")).toMatchObject({ from: "2026-10-25", days: 3, total: 30, perDay: 10 });
    expect(rollingStart("2026-11-23")).toBe("2026-10-25"); // 30th day: window full
    expect(rollingStart("2026-11-24")).toBe("2026-10-26"); // then it rolls
  });
});
