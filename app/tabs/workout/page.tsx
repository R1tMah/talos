import { redirect } from "next/navigation";

/** Old location, kept so saved links still land on the Workout tab. */
export default function OldWorkoutRoute() {
  redirect("/workout");
}
