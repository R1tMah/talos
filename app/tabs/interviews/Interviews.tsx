"use client";

import type { GroupTabName } from "@/lib/tabGroups";
import { AiAssistedScreen } from "./AiAssistedScreen";
import { BehavioralScreen } from "./BehavioralScreen";
import { InterviewsHub } from "./InterviewsHub";
import { LeetCodeScreen } from "./LeetCodeScreen";
import { SystemDesignScreen } from "./SystemDesignScreen";

/**
 * Interviews: a hub of cards (LeetCode, Behavioral, System Design, AI-Assisted), each opening
 * its own full screen at /tabs/interviews?tab=…, whose back arrow returns to the hub.
 * The tab names and archive keys are in lib/tabGroups.ts.
 */
export function Interviews({ initial }: { initial: GroupTabName<"interviews"> | null }) {
  if (initial === "leetcode") return <LeetCodeScreen />;
  if (initial === "system-design") return <SystemDesignScreen />;
  if (initial === "ai-assisted") return <AiAssistedScreen />;
  if (initial === "behavioral") return <BehavioralScreen />;
  return <InterviewsHub />;
}
