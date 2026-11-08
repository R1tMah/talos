"use client";

import { NotepadScreen } from "@/components/Notepad";

/** System Design, one of the Interviews screens: summaries of mock system design rounds. */
export function SystemDesignScreen({ back = "/tabs/recruiting?tab=interviews" }: { back?: string }) {
  return <NotepadScreen kind="sysdesign" title="System Design" back={back} />;
}
