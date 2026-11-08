import type { ReactNode } from "react";

/** Lifts (Liftoff imports) is always on. The retired in-app logger's screens stay behind FLAGS.workout. */
export default function LiftsLayout({ children }: { children: ReactNode }) {
  return children;
}
