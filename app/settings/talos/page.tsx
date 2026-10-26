import { NotepadScreen } from "@/components/Notepad";

// Ideas for improving Talos, as a checklist. Opened from Settings.
export default function Page() {
  return <NotepadScreen kind="talos" title="Talos Improvements" checkable back="/settings" />;
}
