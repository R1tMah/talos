"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { GROUPS, type GroupTabName } from "@/lib/tabGroups";
import { useGroupTab } from "@/lib/useGroupTab";
import { InterviewsHub } from "../interviews/InterviewsHub";
import { ApplicationsScreen } from "./ApplicationsScreen";
import { CallbacksScreen } from "./CallbacksScreen";

/** The switch's name for the Interviews hub (LeetCode, Behavioral, System Design, AI-Assisted). */
export const INTERVIEWS_TAB = "interviews";

/**
 * Applications, Callbacks and Interviews on one page, switched at the top. Applications
 * and Callbacks are a tab group (lib/tabGroups.ts); Interviews is the prep hub, whose
 * cards open their own screens (/tabs/interviews?tab=…) and come back here.
 */
export function Recruiting({ initial, interviews: startOnInterviews }: { initial: GroupTabName<"recruiting"> | null; interviews?: boolean }) {
  const { current, options, pick } = useGroupTab("recruiting", initial);
  const [onInterviews, setOnInterviews] = useState(!!startOnInterviews);
  const archived = useArchivedTabs();
  // Interviews joins the switch unless every one of its tabs is archived.
  const interviewsShown = onInterviews || GROUPS.interviews.some((t) => !archived?.has(t.key));
  const group = options.length ? options : [{ value: current.tab, label: GROUPS.recruiting.find((t) => t.tab === current.tab)!.label }];
  const all = interviewsShown ? [...group, { value: INTERVIEWS_TAB, label: "Interviews" }] : group;

  const choose = (v: string) => {
    if (v === INTERVIEWS_TAB) {
      setOnInterviews(true);
      const q = new URLSearchParams(window.location.search);
      q.set("tab", INTERVIEWS_TAB);
      window.history.replaceState(null, "", `/tabs/recruiting?${q}`);
      return;
    }
    setOnInterviews(false);
    pick(v);
  };
  const switcher = all.length > 1 ? <Segmented options={all} value={onInterviews ? INTERVIEWS_TAB : current.tab} onChange={choose} /> : undefined;

  if (onInterviews) return <InterviewsHub switcher={switcher} />;
  return current.key === "callbacks" ? <CallbacksScreen switcher={switcher} /> : <ApplicationsScreen switcher={switcher} />;
}
