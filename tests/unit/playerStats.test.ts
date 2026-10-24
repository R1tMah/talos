// A followed player's season line on a Watch team card: per-game numbers as ESPN gives
// them, eFG% and TS% from the season totals, and nothing from other seasons.

import { describe, expect, it } from "vitest";
import { seasonLine } from "@/lib/watch/adapters";

const cat = (name: string, labels: string[], rows: [number, string[]][]) => ({
  name, labels, statistics: rows.map(([year, stats]) => ({ season: { year }, stats })),
});

const stats = {
  categories: [
    cat("averages", ["GP", "GS", "MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"], [
      [2026, ["72", "72", "30.1", "5.0-10.0", "50.0", "1.0-3.0", "33.3", "3.0-4.0", "75.0", "1", "5", "6.0", "3.0", "0.4", "0.9", "2.5", "2.1", "14.0"]],
      [2027, ["1", "1", "23.0", "7.0-16.0", "43.8", "2.0-4.0", "50.0", "2.0-4.0", "50.0", "3.0", "7.0", "10.0", "4.0", "0.0", "2.0", "1.0", "2.0", "18.0"]],
    ]),
    cat("totals", ["FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"], [
      [2027, ["7-16", "43.8", "2-4", "50.0", "2-4", "50.0", "3", "7", "10", "4", "0", "2", "1", "2", "18"]],
    ]),
    cat("miscellaneous", ["DD2", "TD3", "AST/TO"], [[2027, ["1", "0", "2.0"]]]),
  ],
};

describe("seasonLine", () => {
  it("keeps points, rebounds, assists, turnovers and the efficiency numbers for that season", () => {
    expect(seasonLine(stats, 2027)).toEqual({
      GP: "1", PTS: "18.0", REB: "10.0", AST: "4.0", TO: "2.0",
      "FG%": "43.8", "3P%": "50.0", "FT%": "50.0",
      "eFG%": "50.0", // (7 + 0.5 * 2) / 16
      "TS%": "50.7", // 18 / (2 * (16 + 0.44 * 4)) = 18 / 35.52
      "AST/TO": "2.0",
    });
  });

  it("is null when they haven't played that season, rather than showing an old one", () => {
    expect(seasonLine(stats, 2028)).toBeNull();
  });

  it("shows a dash for eFG% and TS% when the totals are missing", () => {
    const line = seasonLine({ categories: stats.categories.filter((c) => c.name === "averages") }, 2026);
    expect(line).toMatchObject({ PTS: "14.0", "eFG%": "–", "TS%": "–", "AST/TO": "–" });
  });
});
