"use client";

import { Segmented } from "@/components/ui";
import type { GroupTabName } from "@/lib/tabGroups";
import { useGroupTab } from "@/lib/useGroupTab";
import { ApplicationsScreen } from "./ApplicationsScreen";
import { CallbacksScreen } from "./CallbacksScreen";

/** Applications and Callbacks on one page, switched at the top (lib/tabGroups.ts). */
export function Recruiting({ initial }: { initial: GroupTabName<"recruiting"> | null }) {
  const { current, options, pick } = useGroupTab("recruiting", initial);
  const switcher = options.length ? <Segmented options={options} value={current.tab} onChange={pick} /> : undefined;
  return current.key === "callbacks" ? <CallbacksScreen switcher={switcher} /> : <ApplicationsScreen switcher={switcher} />;
}
