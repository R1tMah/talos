import { describe, expect, it } from "vitest";
import { matchTitle, titleScore } from "@/lib/agent/lcMatch";

// A slice of lc_catalog with the near neighbours that made the old matching go wrong.
const catalog = [
  "Encode and Decode Strings", "Decode String", "Decode Ways", "Reorder List", "Reverse Linked List", "Linked List Cycle",
  "Group Anagrams", "Valid Anagram", "Two Sum", "Sum of Two Integers", "3Sum", "House Robber", "House Robber II",
  "Course Schedule", "Course Schedule II", "Valid Parentheses", "Valid Parenthesis String", "Generate Parentheses",
  "Minimum Window Substring", "Min Stack", "Trapping Rain Water", "Longest Substring Without Repeating Characters",
].map((title) => ({ title, aliases: [] as string[], difficulty: null }));

const pick = (typed: string) => {
  const m = matchTitle(typed, catalog);
  return m.kind === "match" ? m.entry.title : m.kind;
};

describe("LeetCode title matching (from real messages, Oct 14-17)", () => {
  it("matches names typed loosely", () => {
    expect(pick("encode decode string")).toBe("Encode and Decode Strings");
    expect(pick("group anagram")).toBe("Group Anagrams");
    expect(pick("min window substring")).toBe("Minimum Window Substring");
    expect(pick("valid parenthesis")).toBe("Valid Parentheses");
    expect(pick("generate parenthesis")).toBe("Generate Parentheses");
  });

  it("treats numbers as part of the name", () => {
    expect(pick("house robber 2")).toBe("House Robber II");
    expect(pick("house robber")).toBe("House Robber");
    expect(pick("course schedule 2")).toBe("Course Schedule II");
    expect(pick("2sum")).toBe("none"); // never 3Sum
  });

  it("asks instead of guessing when it isn't a clear winner", () => {
    const m = matchTitle("Reorder linked list", catalog);
    expect(m.kind).toBe("options");
    expect(m.kind === "options" && m.entries[0].title).toBe("Reorder List");
  });

  it("keeps problems the catalog doesn't have", () => {
    expect(pick("actors and directors who cooperated at least three times")).toBe("none");
  });

  it("uses aliases", () => {
    const withAlias = [{ title: "Reorder List", aliases: ["reorder linked list"], difficulty: "medium" }];
    expect(titleScore("reorder linked list", withAlias[0].aliases[0])).toBe(1);
    const m = matchTitle("Reorder linked list", withAlias);
    expect(m.kind === "match" && m.entry.title).toBe("Reorder List");
  });
});
