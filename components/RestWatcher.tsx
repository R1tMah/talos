"use client";

import { useEffect, useState } from "react";
import { playChime } from "@/lib/chime";
import { useWorkoutClock } from "@/lib/workoutClock";

/**
 * Finishes the rest timer from any screen: chime plus screen flash when the
 * stored rest end time passes, wherever the owner is in the app.
 */
export function RestWatcher() {
  const endsAt = useWorkoutClock().restEndsAt;
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (endsAt == null) return;
    const ms = endsAt - Date.now();
    if (ms <= 0) return; // already expired, e.g. after a reload
    const id = setTimeout(() => {
      playChime();
      setFlash((f) => f + 1);
    }, ms);
    return () => clearTimeout(id);
  }, [endsAt]);

  return flash > 0 ? <div key={flash} className="flash" onAnimationEnd={() => setFlash(0)} /> : null;
}
