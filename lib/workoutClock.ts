"use client";

import { useEffect, useState } from "react";

/**
 * The live workout's clock, kept on the device: when it started (for the tab bar's
 * elapsed time) and when the rest countdown ends. Timestamps, not running counters,
 * so a reload or iOS suspending the page still shows the right time.
 */
export interface WorkoutClock {
  startedAt: number | null;
  restEndsAt: number | null;
}

const KEY = "talos.workoutClock";
const EVT = "talos:workout-clock";
const EMPTY: WorkoutClock = { startedAt: null, restEndsAt: null };

function read(): WorkoutClock {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

function write(patch: Partial<WorkoutClock>) {
  const next = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

/** Called when the Workout tab loads or starts/ends a workout. */
export const setWorkoutStarted = (startedAt: number | null) => write(startedAt == null ? { startedAt: null, restEndsAt: null } : { startedAt });
export const startRest = (seconds: number) => write({ restEndsAt: Date.now() + seconds * 1000 });
export const setRestEndsAt = (restEndsAt: number | null) => write({ restEndsAt });
export const cancelRest = () => write({ restEndsAt: null });

export function useWorkoutClock(): WorkoutClock {
  const [clock, setClock] = useState<WorkoutClock>(EMPTY);
  useEffect(() => {
    const sync = () => setClock(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return clock;
}
