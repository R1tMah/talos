// Home cards: which rows each TALOS card shows, from the owner's picks or the defaults.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardDef, cleanPick, HOME_CARDS, pickRows, shownRows } from "@/lib/homeCards";

// The Recruiting card: Interviews and OAs show by default, Applications by status doesn't.
const rows = [
  { key: "interviews", label: "Interviews", value: 3 },
  { key: "statuses", label: "Applied", value: 2 },
  { key: "oas", label: "OAs", value: 1 },
];

describe("which rows a card shows", () => {
  it("an untouched card shows its defaults, in the order given", () => {
    expect(pickRows("recruiting", {}, rows).map((r) => r.label)).toEqual(["Interviews", "OAs"]);
    expect(pickRows("recruiting", null, rows).map((r) => r.label)).toEqual(["Interviews", "OAs"]);
  });

  it("a customized card shows exactly the picked rows, and keys don't reach StatCard", () => {
    expect(pickRows("recruiting", { recruiting: ["statuses"] }, rows)).toEqual([{ label: "Applied", value: 2 }]);
    expect(pickRows("recruiting", { recruiting: [] }, rows)).toEqual([]);
  });

  it("other cards' picks don't leak", () => {
    expect(pickRows("recruiting", { weight: ["lastWeek"] }, rows).map((r) => r.label)).toEqual(["Interviews", "OAs"]);
  });

  it("a fallback row shows on an untouched card only", () => {
    const st = [{ key: "statuses", label: "Applied", value: 4, fallback: true }];
    expect(pickRows("recruiting", {}, st)).toHaveLength(1);
    expect(pickRows("recruiting", { recruiting: ["oas"] }, st)).toHaveLength(0);
    expect(pickRows("recruiting", { recruiting: ["statuses"] }, [{ ...st[0], fallback: false }])).toHaveLength(1);
  });

  it("several rows can share one key (each application status)", () => {
    const st = ["Applied", "OA", "Rejected"].map((label) => ({ key: "statuses", label, value: 1 }));
    expect(pickRows("recruiting", { recruiting: ["statuses"] }, st)).toHaveLength(3);
  });
});

describe("what gets saved", () => {
  it("only known rows, once each, in the card's own order", () => {
    expect(cleanPick("recruiting", ["oas", "nope", "interviews", "interviews"])).toEqual(["interviews", "oas"]);
    expect(cleanPick("not-a-card", ["x"])).toEqual([]);
  });

  it("defaults are what each card showed before", () => {
    expect([...shownRows("recruiting", {})]).toEqual(["interviews", "oas", "recruiter"]);
    expect([...shownRows("weight", {})]).toEqual(["thisWeek", "lastWeek"]);
    expect(shownRows("recruiting", {}).has("statuses")).toBe(false);
  });
});

describe("the registry matches the home page", () => {
  it("card and row keys are unique", () => {
    const cards = HOME_CARDS.map((c) => c.key);
    expect(new Set(cards).size).toBe(cards.length);
    for (const c of HOME_CARDS) expect(new Set(c.rows.map((r) => r.key)).size).toBe(c.rows.length);
  });

  it("every card and literal row key the page uses exists", () => {
    const src = readFileSync(new URL("../../app/tabs/page.tsx", import.meta.url), "utf8");
    const calls = [...src.matchAll(/pickRows\("([a-z]+)", cards, ([\s\S]*?)\)\}/g)];
    expect(calls.length).toBeGreaterThanOrEqual(11);
    for (const [, card, body] of calls) {
      const def = cardDef(card);
      expect(def, card).toBeDefined();
      for (const [, key] of body.matchAll(/key: "([A-Za-z]+)"/g)) expect(def!.rows.some((r) => r.key === key), `${card}.${key}`).toBe(true);
    }
  });
});
