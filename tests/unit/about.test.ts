// Settings > About stays complete: every tab the app knows has a description, and the
// copied text has the three sections in order with live archived/paused marks.

import { describe, expect, it } from "vitest";
import { ABOUT_TABS, WATCH_KINDS, aboutSections, aboutText } from "@/lib/about";
import { GROUPS } from "@/lib/tabGroups";
import { ARCHIVABLE, CHAT_TABS, ONCE_IN_A_WHILE } from "@/lib/tabs";

describe("about", () => {
  const keys = new Set(ABOUT_TABS.map((t) => t.key));

  it("describes every tab in lib/tabs.ts and lib/tabGroups.ts (add new tabs to lib/about.ts)", () => {
    const known = [
      ...ARCHIVABLE.map((t) => t.key),
      ...CHAT_TABS.map((t) => t.key),
      ...ONCE_IN_A_WHILE.map((t) => t.key),
      ...Object.values(GROUPS).flatMap((g) => g.map((t) => t.key)),
    ];
    expect(known.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("lists each tab once", () => {
    expect(keys.size).toBe(ABOUT_TABS.length);
  });

  it("builds General, Tabs and Watch sections with live marks", () => {
    const text = aboutText(aboutSections(new Set(["runs"]), [
      { title: "Blazers", kind: "espn_team", enabled: true },
      { title: "Commute", kind: "transit", enabled: false },
    ]));
    expect(text.indexOf("General:")).toBe(0);
    expect(text.indexOf("Tabs currently supported:")).toBeGreaterThan(0);
    expect(text.indexOf("Watch tabs:")).toBeGreaterThan(text.indexOf("Tabs currently supported:"));
    expect(text).toContain("- Runs (Tabs, archived):");
    expect(text).toContain(`- Blazers (Team): ${WATCH_KINDS.espn_team.about}`);
    expect(text).toContain("- Commute (Train departures, paused):");
  });

  it("says so when there are no Watch tabs or they failed to load", () => {
    expect(aboutText(aboutSections(new Set(), []))).toContain("Watch tabs:\n- None set up yet.");
    expect(aboutText(aboutSections(new Set(), null))).toContain("Couldn't load Watch tabs.");
  });
});
