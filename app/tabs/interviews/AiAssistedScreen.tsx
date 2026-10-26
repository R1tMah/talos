"use client";

import type { ReactNode } from "react";
import { NotepadScreen } from "@/components/Notepad";

/** The AI-Assisted tab of Interviews: summaries of mock AI-assisted coding rounds, pasted in afterwards. */
export function AiAssistedScreen({ switcher }: { switcher?: ReactNode }) {
  return <NotepadScreen kind="aiassisted" title="Interviews" switcher={switcher} />;
}
