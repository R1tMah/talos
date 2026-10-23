// A grams number with no macro named is protein: "320 calories 40gs snack" logs 40 g protein.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { run } from "@/lib/agent/run";
import { bareProteinG } from "@/lib/agent/tools";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

describe("bare grams as protein", () => {
  it.each([
    ["320 calories 40gs snack", 40],
    ["chicken bowl 650 cal 40g", 40],
    ["shake 300 cal, 50 grams", 50],
    ["snack 200 cal 25 g and 10g carbs", 25],
    ["40g protein bar 210 cal", 40],
    ["burrito 900 calories 45.5g", 45.5],
  ])("%s -> %s", (text, want) => expect(bareProteinG(text)).toBe(want));

  it.each([
    ["200g chicken 330 cal", "an amount of food"],
    ["oats 300 cal 50g carbs", "another macro"],
    ["fat 12g, 400 cal", "another macro"],
    ["100g of rice 130 cal", "an amount of food"],
    ["bowl 600 cal 40g 30g", "two numbers: no guessing"],
    ["salad 400 cal", "no grams at all"],
    ["yogurt 100g 59 cal", "more protein than the calories allow"],
  ])("%s -> null (%s)", (text) => expect(bareProteinG(text)).toBeNull());

  it("a number already used for another field isn't reused", () => {
    expect(bareProteinG("yogurt 100g 59 cal", [59, 100])).toBeNull();
  });
});

describe("chat", () => {
  beforeEach(() => model.reset());

  it("'320 calories 40gs snack' logs 40 g protein even when the model left it null", async () => {
    model.toolCalls({
      name: "log_food",
      input: { description: "snack", food: null, servings: null, calories: 320, protein_g: null, carbs_g: null, fat_g: null, days_ago: null, confidence: 0.95 },
    });
    const f = fakeDb();
    const r = await run(ctxFor("320 calories 40gs snack", f.db), 0.85, proposals().propose);
    expect(r.cards[0].kind).toBe("saved");
    expect(f.writes()[0]).toMatchObject({ fn: "log_food", args: { p_calories: 320, p_protein_g: 40 } });
  });
});
