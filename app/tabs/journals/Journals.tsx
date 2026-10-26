"use client";

import { LongTermScreen } from "@/components/LongTerm";
import { NotepadScreen } from "@/components/Notepad";
import { Segmented } from "@/components/ui";
import type { GroupTabName } from "@/lib/tabGroups";
import { useGroupTab } from "@/lib/useGroupTab";

/** Personal, Work and Content journals and Long Term on one page, switched at the top (lib/tabGroups.ts). */
export function Journals({ initial }: { initial: GroupTabName<"journals"> | null }) {
  const { current, options, pick } = useGroupTab("journals", initial);
  const switcher = options.length ? <Segmented options={options} value={current.tab} onChange={pick} /> : undefined;
  if (current.key === "longterm") return <LongTermScreen title="Journals" switcher={switcher} />;
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
