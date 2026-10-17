import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FLAGS } from "@/lib/flags";

/** Workout screens are behind FLAGS.workout; while it's off they send you to Tabs. */
export default function WorkoutFlag({ children }: { children: ReactNode }) {
  if (!FLAGS.workout) redirect("/tabs");
  return children;
}
