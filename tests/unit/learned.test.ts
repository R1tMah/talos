import { describe, expect, it } from "vitest";
import type { ChatCard } from "@/lib/agent/cards";
import { learnedTab, similarity, suggest, words } from "@/lib/agent/learned";

describe("Learned picks: reading a message", () => {
  it("keeps the words that say what it's about", () => {
    expect([...words("I had 3 eggs and toast this morning")].sort()).toEqual(["#num", "egg", "toast"]);
    expect(words("$12.50 at Chipotle").has("#money")).toBe(true);
    expect(words("168.4").has("#num")).toBe(true);
  });

  it("scores overlap from 0 to 1", () => {
    expect(similarity(words("eggs and toast"), words("toast and eggs"))).toBe(1);
    expect(similarity(words("eggs"), words("ran 5 miles"))).toBe(0);
    expect(similarity(new Set(), words("x"))).toBe(0);
  });
});

describe("Learned picks: choosing a tab", () => {
  const past = [
    { text: "chipotle bowl $14", tab: "spending" },
    { text: "two eggs and toast", tab: "nutrition" },
    { text: "idea: video on system design", tab: "content" },
  ];

  it("suggests the tab picked for a message that reads the same", () => {
    expect(learnedTab("eggs and toast", past)).toBe("nutrition");
    expect(learnedTab("Chipotle bowl $16", past)).toBe("spending");
  });

  it("needs a real shared word, not just a number", () => {
    expect(learnedTab("170", [{ text: "168", tab: "weight" }])).toBeNull();
  });

  it("says nothing when nothing is close", () => {
    expect(learnedTab("called mom about thanksgiving", past)).toBeNull();
  });

  it("skips archived tabs and anything that isn't a chat tab", () => {
    expect(learnedTab("eggs and toast", past, new Set(["nutrition"]))).toBeNull();
    expect(learnedTab("eggs and toast", [{ text: "eggs and toast", tab: "portfolio" }])).toBeNull();
  });

  it("takes the closest match, and the newest one on a tie", () => {
    const picks = [
      { text: "eggs toast", tab: "nutrition" }, // newest first
      { text: "eggs toast", tab: "spending" },
      { text: "eggs toast coffee juice", tab: "content" },
    ];
    expect(learnedTab("eggs toast", picks)).toBe("nutrition");
  });
});

describe("Learned picks: the card", () => {
  const opt = (tab: string) => ({ tool: tab, fields: [] as [string, string][], proposalId: tab, tab });
  const card: ChatCard = { kind: "unsure", options: [opt("spending"), opt("nutrition")] };

  it("moves the learned tab's option first and marks the card", () => {
    const [c] = suggest([card], "nutrition");
    expect(c.kind === "unsure" && c.options.map((o) => o.tab)).toEqual(["nutrition", "spending"]);
    expect(c.kind === "unsure" && c.suggested).toBe("nutrition");
  });

  it("marks the card even when no option is in that tab (it's offered as a tab)", () => {
    const [c] = suggest([card], "runs");
    expect(c.kind === "unsure" && c.suggested).toBe("runs");
    expect(c.kind === "unsure" && c.options.map((o) => o.tab)).toEqual(["spending", "nutrition"]);
  });

  it("leaves narrower questions and other cards alone", () => {
    const titled: ChatCard = { ...card, title: "Which meal?" };
    const failed: ChatCard = { kind: "failed" };
    expect(suggest([titled, failed], "nutrition")).toEqual([titled, failed]);
    expect(suggest([card], null)).toEqual([card]);
  });
});
