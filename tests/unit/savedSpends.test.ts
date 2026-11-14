// Saved spendings in chat: log_saved_spend matches a saved purchase by name or alias and
// logs its saved amount (× how many), or a price the owner typed. Never a guess.

import { describe, expect, it } from "vitest";
import { TAB_TOOLS } from "@/lib/agent/scope";
import { TOOLS, type Ctx, type SavedSpendRow } from "@/lib/agent/tools";

const spends: SavedSpendRow[] = [
  { id: "latte", name: "Iced latte", aliases: ["latte", "coffee"], amount: 6.25, category: "Food & drink" },
  { id: "pass", name: "Gym day pass", aliases: [], amount: 15, category: "Health" },
  { id: "gas", name: "Gas", aliases: ["fill up"], amount: null, category: "Transport" },
];
const ctx = (text: string): Ctx => ({ text, today: "2026-11-13", meals: [], foods: [], savedSpends: spends } as unknown as Ctx);
const check = (input: Record<string, unknown>, text: string) =>
  TOOLS.log_saved_spend.check!({ count: null, amount: null, days_ago: null, confidence: 0.9, ...input }, ctx(text));

describe("Saved spendings: logging one from chat", () => {
  it("an exact name or alias logs the saved amount", async () => {
    const out = await check({ name: "latte" }, "latte");
    expect(out).toMatchObject({ status: "ready", resolved: { saved_id: "latte", count: 1, amount: null, date: "2026-11-13" } });
    if (out.status === "ready") expect(out.fields).toContainEqual(["Amount", "$6.25"]);
  });

  it("'2 lattes' logs two", async () => {
    const out = await check({ name: "latte", count: 2 }, "2 lattes");
    expect(out).toMatchObject({ status: "ready", resolved: { count: 2 } });
    if (out.status === "ready") expect(out.fields).toContainEqual(["Amount", "$12.50 (2 × $6.25)"]);
  });

  it("a price the owner typed overrides the saved one; one they didn't type is ignored", async () => {
    expect(await check({ name: "latte", amount: 7 }, "latte 7 today")).toMatchObject({ status: "ready", resolved: { amount: 7 } });
    expect(await check({ name: "latte", amount: 7 }, "latte")).toMatchObject({ status: "ready", resolved: { amount: null } });
  });

  it("one saved without an amount asks for it", async () => {
    expect(await check({ name: "gas" }, "gas")).toMatchObject({ status: "missing", missing: [{ name: "amount" }] });
    expect(await check({ name: "gas", amount: 40 }, "gas 40")).toMatchObject({ status: "ready", resolved: { amount: 40 } });
    expect(TOOLS.log_saved_spend.fill!({ saved_id: "gas" }, { amount: 41.5 })).toEqual({ saved_id: "gas", amount: 41.5 });
    expect(TOOLS.log_saved_spend.fill!({ saved_id: "gas" }, { amount: 0 })).toBe("Amount must be more than 0.");
  });

  it("a near miss is offered, never logged on a guess", async () => {
    const out = await check({ name: "gym pass" }, "gym pass");
    expect(out.status).toBe("ambiguous");
    if (out.status === "ambiguous") expect(out.options[0].resolved.saved_id).toBe("pass");
  });

  it("nothing like it says so", async () => {
    expect(await check({ name: "concert tickets" }, "concert tickets")).toMatchObject({ status: "invalid" });
    expect(await check({ name: "" }, "")).toMatchObject({ status: "invalid" });
  });

  it("is a Spending tool, so the Spending chip and EOD's spending can use it", () => {
    expect(TAB_TOOLS.spending).toContain("log_saved_spend");
  });
});
