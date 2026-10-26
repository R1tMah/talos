import { ScreenHeader } from "@/components/ui";
import { WeeklyEmailSettings } from "@/components/WeeklyEmailSettings";

/** Settings > Weekly email: on/off, its sections, and a test send. */
export default function WeeklyEmailPage() {
  return (
    <main className="screen">
      <ScreenHeader title="Weekly email" back="/settings" />
      <WeeklyEmailSettings />
    </main>
  );
}
