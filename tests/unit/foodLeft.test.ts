// After food is logged, chat says what's left of the day's calories and protein:
// the database's own totals and targets, never the model's arithmetic.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import type { ChatCard } from "@/lib/agent/cards";
import { commitCard, run } from "@/lib/agent/run";
import { leftText } from "@/components/ResultCard";
import { ctxFor, fakeDb, proposals, TODAY } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const food = (description: string, calories: number, protein: number, extra: Record<string, unknown> = {}) => ({
  name: "log_food",
  input: { description, food: null, servings: null, calories, protein_g: protein, carbs_g: null, fat_g: null, days_ago: null, confidence: 0.95, ...extra },
});
const targets = { targets_for: () => [{ calorie_target: 2200, protein_target_g: 160 }] };
const totals = (calories: number, protein: number, date = TODAY) => ({ daily_totals: [{ logical_date: date, calories, protein_g: protein }] });

async function send(text: string, opts: { tables?: Record<string, Record<string, unknown>[]>; rpc?: Record<string, (a: Record<string, unknown>) => unknown> } = {}) {
  const f = fakeDb({ tables: opts.tables, rpc: opts.rpc });
  return run(ctxFor(text, f.db), 0.85, proposals().propose);
}
const left = (cards: ChatCard[]) => cards.filter((c): c is Extract<ChatCard, { kind: "left" }> => c.kind === "left");

beforeEach(() => model.reset());

describe("what's left after logging food", () => {
  it("a logged food is followed by the day's totals against its targets", async () => {
    model.toolCalls(food("dinner", 700, 50));
    const r = await send("dinner 700 cal 50 protein", { tables: totals(1450, 98), rpc: targets });
    expect(r.cards.map((c) => c.kind)).toEqual(["saved", "left"]);
    expect(r.cards[1]).toEqual({ kind: "left", date: TODAY, cal: 1450, calTarget: 2200, protein: 98, proteinTarget: 160 });
  });

  it("several foods in one message get one summary, after all of them", async () => {
    model.toolCalls(food("eggs", 300, 20), food("toast", 200, 6));
    const r = await send("eggs 300 cal 20 protein, toast 200 cal 6 protein", { tables: totals(500, 26), rpc: targets });
    expect(r.cards.map((c) => c.kind)).toEqual(["saved", "saved", "left"]);
  });

  it("food logged to yesterday reports yesterday's day", async () => {
    model.toolCalls(food("pizza", 900, 40, { days_ago: 1 }));
    const r = await send("yesterday pizza 900 cal 40 protein", { tables: totals(2500, 120, "2026-10-10"), rpc: targets });
    expect(left(r.cards)[0]).toMatchObject({ date: "2026-10-10", cal: 2500 });
  });

  it("a food that isn't saved gets no summary", async () => {
    model.toolCalls(food("burrito", null as unknown as number, null as unknown as number));
    const r = await send("had a burrito", { tables: totals(0, 0), rpc: targets });
    expect(left(r.cards)).toEqual([]);
  });

  it("if the targets can't be read, the food is still saved and there's just no summary", async () => {
    model.toolCalls(food("dinner", 700, 50));
    const r = await send("dinner 700 cal 50 protein", { tables: totals(1450, 98) });
    expect(r.cards.map((c) => c.kind)).toEqual(["saved"]);
  });

  it("other logs don't get one", async () => {
    const r = await send("168.4", { tables: totals(1450, 98), rpc: targets });
    expect(left(r.cards)).toEqual([]);
  });

  it("a food saved from a tapped card (confirm route) gets one too", async () => {
    const f = fakeDb({ tables: totals(800, 60), rpc: targets });
    const cards = await commitCard("log_food", { date: TODAY, description: "wrap", calories: 650, protein_g: 50 }, { db: f.db, archived: new Set() }, proposals().propose);
    expect(cards.map((c) => c.kind)).toEqual(["saved", "left"]);
  });
});

describe("how it reads", () => {
  it.each([
    [750, "cal", "750 cal left"],
    [1450.4, "cal", "1,450 cal left"],
    [0, "g protein", "0 g protein left"],
    [-320, "cal", "320 cal over"],
  ])("%s %s -> %s", (n, unit, want) => expect(leftText(n, unit)).toBe(want));
});
