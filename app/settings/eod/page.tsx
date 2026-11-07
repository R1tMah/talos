import { ScreenHeader } from "@/components/ui";
import { EodSettings } from "@/components/EodSettings";

/** Settings > End of day: the questions "EOD" asks in chat, and where each answer goes. */
export default function EodSettingsPage() {
  return (
    <main className="screen">
      <ScreenHeader title="End of day" back="/settings" />
      <EodSettings />
    </main>
  );
}
