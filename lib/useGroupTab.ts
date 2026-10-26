"use client";

import { useState } from "react";
import { useArchivedTabs } from "./archivedTabs";
import { GROUPS, type Group, type GroupTab, type GroupTabName } from "./tabGroups";

/**
 * The picked tab of a group page, kept in the URL (?tab=…) so back and refresh return to
 * it. Archived tabs drop out of the switch, except the one being shown (reached from the
 * Archived list). `options` is empty when there's nothing to switch between.
 */
export function useGroupTab<G extends Group>(group: G, initial: GroupTabName<G> | null) {
  const tabs = GROUPS[group] as readonly GroupTab[];
  const archived = useArchivedTabs();
  const [tab, setTab] = useState<string>(initial ?? tabs.find((t) => !archived?.has(t.key))?.tab ?? tabs[0].tab);
  const current = tabs.find((t) => t.tab === tab)!;
  const options = tabs.filter((t) => t.tab === tab || !archived?.has(t.key)).map((t) => ({ value: t.tab, label: t.label }));
  const pick = (t: string) => {
    setTab(t);
    // Keep any other params; only the picked tab changes.
    const q = new URLSearchParams(window.location.search);
    q.set("tab", t);
    window.history.replaceState(null, "", `/tabs/${group}?${q}`);
  };
  return { current, options: options.length > 1 ? options : [], pick };
}
