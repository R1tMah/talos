"use client";

import { NotepadScreen } from "@/components/Notepad";

/** AI-Assisted, one of the Interviews screens: summaries of mock AI-assisted coding rounds, pasted in afterwards. */
export function AiAssistedScreen({ back = "/tabs/recruiting?tab=interviews" }: { back?: string }) {
  return <NotepadScreen kind="aiassisted" title="AI-Assisted" back={back} />;
}
