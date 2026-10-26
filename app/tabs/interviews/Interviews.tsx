"use client";

import { Segmented } from "@/components/ui";
import type { GroupTabName } from "@/lib/tabGroups";
import { useGroupTab } from "@/lib/useGroupTab";
import { AiAssistedScreen } from "./AiAssistedScreen";
import { LeetCodeScreen } from "./LeetCodeScreen";
import { SystemDesignScreen } from "./SystemDesignScreen";

/** LeetCode, System Design and AI-Assisted on one page, switched at the top (lib/tabGroups.ts). */
export function Interviews({ initial }: { initial: GroupTabName<"interviews"> | null }) {
  const { current, options, pick } = useGroupTab("interviews", initial);
  const switcher = options.length ? <Segmented options={options} value={current.tab} onChange={pick} /> : undefined;
  if (current.key === "sysdesign") return <SystemDesignScreen switcher={switcher} />;
  if (current.key === "aiassisted") return <AiAssistedScreen switcher={switcher} />;
  return <LeetCodeScreen switcher={switcher} />;
}
