// Finances arithmetic shared by the tab and its Tabs card, and the transactions export.

import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/exportTab";
import { flow, fmtMoney, monthStart, netWorth, vanguardTotal, type Transaction } from "@/lib/finances";
import { financesExport } from "@/lib/screenExports";

const txn = (date: string, amount: number, description = "x"): Transaction => ({
  id: `${date}-${amount}`, date, time: "12:00", amount, description, category: null, note: null,
});

describe("fmtMoney", () => {
  it("formats dollars with cents, a real minus sign, and an optional plus", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
    expect(fmtMoney(-12)).toBe("−$12.00");
    expect(fmtMoney(50, { sign: true })).toBe("+$50.00");
    expect(fmtMoney(-50, { sign: true })).toBe("−$50.00");
    expect(fmtMoney(0, { sign: true })).toBe("$0.00");
    expect(fmtMoney(15234.67, { cents: false })).toBe("$15,235");
  });
});

describe("totals", () => {
  it("Vanguard is the sum of its holdings, without float noise", () => {
    expect(vanguardTotal([{ value: 0.1 }, { value: 0.2 }])).toBe(0.3);
    expect(vanguardTotal([{ value: 10000.55 }, { value: 2500.45 }])).toBe(12501);
    expect(vanguardTotal([])).toBeNull();
  });

  it("net worth counts whichever balances exist", () => {
    expect(netWorth(1200.5, 12501)).toBe(13701.5);
    expect(netWorth(null, 500)).toBe(500);
    expect(netWorth(-20, null)).toBe(-20); // overdrawn
    expect(netWorth(null, null)).toBeNull();
  });

  it("this month's flow: out and in from the first of the month on", () => {
    const txns = [txn("2026-10-22", -12.5), txn("2026-10-20", 800), txn("2026-10-01", -40.25), txn("2026-09-30", -999)];
    expect(monthStart("2026-10-22")).toBe("2026-10-01");
    expect(flow(txns, monthStart("2026-10-22"))).toEqual({ out: 52.75, in: 800 });
    expect(flow([], "2026-10-01")).toEqual({ out: 0, in: 0 });
  });
});

describe("Finances export", () => {
  it("one row per transaction, signed amounts, round-trips commas and quotes", () => {
    const t = financesExport([
      { ...txn("2026-10-22", -12.5, 'Chipotle, "large"'), category: "Food" },
      { ...txn("2026-10-20", 800, "Paycheck"), note: "TA job" },
    ]);
    expect(t.rows).toEqual([
      { date: "2026-10-22", amount: "-12.50", description: 'Chipotle, "large"', category: "Food", note: "" },
      { date: "2026-10-20", amount: "800.00", description: "Paycheck", category: "", note: "TA job" },
    ]);
    expect(toCsv(t).split("\n")).toEqual([
      "Date,Amount,What,Category,Note",
      '2026-10-22,-12.50,"Chipotle, ""large""",Food,',
      "2026-10-20,800.00,Paycheck,,TA job",
    ]);
  });
});
