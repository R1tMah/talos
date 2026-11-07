"use client";

import type { ReactNode } from "react";
import { NotepadScreen } from "@/components/Notepad";

/** The System Design tab of Interviews: summaries of mock system design rounds. */
export function SystemDesignScreen({ switcher }: { switcher?: ReactNode }) {
  return <NotepadScreen kind="sysdesign" title="Interviews" switcher={switcher} />;
}
