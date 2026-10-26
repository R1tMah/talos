"use client";

import { NotepadScreen } from "@/components/Notepad";
import { Segmented } from "@/components/ui";
import type { GroupTabName } from "@/lib/tabGroups";
import { useGroupTab } from "@/lib/useGroupTab";

/** Personal, Work and Content journals on one page, switched at the top (lib/tabGroups.ts). */
export function Journals({ initial }: { initial: GroupTabName<"journals"> | null }) {
  const { current, options, pick } = useGroupTab("journals", initial);
  const switcher = options.length ? <Segmented options={options} value={current.tab} onChange={pick} /> : undefined;
  const kind = current.key as "personal" | "journal" | "content";
  return (
    <NotepadScreen
      key={kind}
      kind={kind}
      title="Journals"
      switcher={switcher}
    />
  );
}
