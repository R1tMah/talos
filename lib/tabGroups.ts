// Tab groups: several tabs shown as one card on Tabs and one page with a switch at the
// top (/tabs/<group>?tab=…). Each tab keeps its own data, archive switch and chat chip;
// only where it's shown changes.
//
// No "use client" here: the group pages read ?tab= on the server with groupTab(). The
// client-side hook for the switch is in lib/useGroupTab.ts.

import type { TabKey } from "./tabs";

export interface GroupTab {
  tab: string; // the name in the URL
  key: TabKey;
  label: string; // on the switch
}

export const GROUPS = {
  journals: [
    { tab: "personal", key: "personal", label: "Personal" },
    { tab: "work", key: "journal", label: "Work" },
    { tab: "content", key: "content", label: "Content" },
  ],
  recruiting: [
    { tab: "applications", key: "applications", label: "Applications" },
    { tab: "callbacks", key: "callbacks", label: "Callbacks" },
  ],
  interviews: [
    { tab: "leetcode", key: "leetcode", label: "LeetCode" },
    { tab: "system-design", key: "sysdesign", label: "Sys Design" },
    { tab: "ai-assisted", key: "aiassisted", label: "AI-Assisted" },
    { tab: "behavioral", key: "behavioral", label: "Behavioral" },
  ],
} as const satisfies Record<string, readonly GroupTab[]>;

export type Group = keyof typeof GROUPS;
export type GroupTabName<G extends Group> = (typeof GROUPS)[G][number]["tab"];

/** The group's tab named in the URL, or null. */
export function groupTab<G extends Group>(group: G, v: unknown): GroupTabName<G> | null {
  return ((GROUPS[group] as readonly GroupTab[]).find((t) => t.tab === v)?.tab ?? null) as GroupTabName<G> | null;
}

/** Where a tab now lives: its group page with that tab picked. */
export function groupHref(group: Group, key: TabKey) {
  return `/tabs/${group}?tab=${(GROUPS[group] as readonly GroupTab[]).find((t) => t.key === key)!.tab}`;
}
