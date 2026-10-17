// The 4am rule (#1, #2, #5, #6) and the shared range checks (#10-#13).

import { describe, expect, it } from "vitest";
import { logicalDateIn } from "@/lib/date";
import { LIMITS, foodWarnings, leetcodeWarnings, weightWarnings } from "@/lib/validate";

const NY = "America/New_York";
const at = (iso: string) => new Date(iso);

describe("1. Logical day (4am rule)", () => {
  it("#1 03:59 local on the 11th resolves to the 10th", () => {
    expect(logicalDateIn(NY, at("2026-10-11T07:59:00Z"))).toBe("2026-10-10"); // 03:59 EDT
  });

  it("#2 04:00 local on the 11th resolves to the 11th", () => {
    expect(logicalDateIn(NY, at("2026-10-11T08:00:00Z"))).toBe("2026-10-11"); // 04:00 EDT
  });

  // Clocks fall back at 02:00 EDT on Nov 1, 2026; spring forward at 02:00 EST on Mar 8, 2026.
  it("#5 after fall back, 03:30 on Nov 1 still belongs to Oct 31", () => {
    expect(logicalDateIn(NY, at("2026-11-01T08:30:00Z"))).toBe("2026-10-31"); // 03:30 EST
  });

  it("#5 after fall back, 04:00 on Nov 1 starts Nov 1", () => {
    expect(logicalDateIn(NY, at("2026-11-01T09:00:00Z"))).toBe("2026-11-01"); // 04:00 EST
  });

  it("#5 after spring forward, 03:30 on Mar 8 still belongs to Mar 7", () => {
    expect(logicalDateIn(NY, at("2026-03-08T07:30:00Z"))).toBe("2026-03-07"); // 03:30 EDT
  });

  it("#5 after spring forward, 04:30 on Mar 8 starts Mar 8", () => {
    expect(logicalDateIn(NY, at("2026-03-08T08:30:00Z"))).toBe("2026-03-08"); // 04:30 EDT
  });

  it("#5 each 4am-to-4am window maps to exactly one logical day across both changes", () => {
    for (const [from, to] of [["2026-10-31T08:00:00Z", "2026-11-01T09:00:00Z"], ["2026-03-07T09:00:00Z", "2026-03-08T08:00:00Z"]]) {
      const days = new Set<string>();
      for (let t = at(from).getTime(); t < at(to).getTime(); t += 15 * 60_000) days.add(logicalDateIn(NY, new Date(t)));
      expect([...days]).toHaveLength(1);
    }
  });

  it("#6 the timezone setting decides the day for new entries", () => {
    const instant = at("2026-10-11T07:30:00Z");
    expect(logicalDateIn("America/New_York", instant)).toBe("2026-10-10"); // 03:30
    expect(logicalDateIn("Asia/Tokyo", instant)).toBe("2026-10-11"); // 16:30
    expect(logicalDateIn("America/Los_Angeles", instant)).toBe("2026-10-10"); // 00:30
  });
});

describe("2. Validation ranges", () => {
  it("#11 weights outside 90-400 lb warn; the bounds themselves don't", () => {
    expect(weightWarnings(90, null)).toEqual([]);
    expect(weightWarnings(400, null)).toEqual([]);
    expect(weightWarnings(89.9, null)).toHaveLength(1);
    expect(weightWarnings(400.1, null)).toHaveLength(1);
    expect(weightWarnings(1680, 169)).toHaveLength(1);
  });

  it("#10 more than 10 lb from the previous weigh-in warns; exactly 10 doesn't", () => {
    expect(weightWarnings(179, 169)).toEqual([]);
    expect(weightWarnings(179.1, 169)).toHaveLength(1);
    expect(weightWarnings(158.9, 169)).toHaveLength(1);
  });

  it("#12 food over 3,000 calories or 300 g protein warns", () => {
    expect(foodWarnings(LIMITS.foodCalories, LIMITS.foodProtein)).toEqual([]);
    expect(foodWarnings(3001, 50)).toHaveLength(1);
    expect(foodWarnings(500, 300.5)).toHaveLength(1);
    expect(foodWarnings(3001, 301)).toHaveLength(2);
  });

  it("#13 LeetCode minutes over 180 warn", () => {
    expect(leetcodeWarnings(180)).toEqual([]);
    expect(leetcodeWarnings(181)).toHaveLength(1);
    expect(leetcodeWarnings(null)).toEqual([]);
  });
});
