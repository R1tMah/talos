import { ScreenHeader } from "@/components/ui";
import { InboxSettings } from "@/components/InboxSettings";

/** Settings > Inbox updates: Gmail scanning for application emails. */
export default function InboxSettingsPage() {
  return (
    <main className="screen">
      <ScreenHeader title="Inbox updates" back="/settings" />
      <InboxSettings />
    </main>
  );
}
