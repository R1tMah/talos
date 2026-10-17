// The workout clock on the device (#71, #79, #81): timestamps, not running counters.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// A browser-like global: localStorage plus window events.
const storage = new Map<string, string>();
beforeAll(() => {
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    window: Object.assign(new EventTarget(), { addEventListener: EventTarget.prototype.addEventListener }),
  });
});
beforeEach(() => storage.clear());

const saved = () => JSON.parse(storage.get("talos.workoutClock") ?? "{}") as { startedAt: number | null; restEndsAt: number | null };

describe("9. Workout clock", () => {
  it("#71 elapsed time comes from the stored start, so it survives the page being suspended", async () => {
    const { setWorkoutStarted } = await import("@/lib/workoutClock");
    const start = Date.now() - 42 * 60_000;
    setWorkoutStarted(start);
    // A "reload" only has what's stored; elapsed is now - startedAt, whatever happened in between.
    expect(Math.round((Date.now() - saved().startedAt!) / 60_000)).toBe(42);
  });

  it("#81 reloading mid-rest shows the correct remaining time from the stored end time", async () => {
    const { startRest } = await import("@/lib/workoutClock");
    const before = Date.now();
    startRest(120);
    const remaining = (saved().restEndsAt! - Date.now()) / 1000;
    expect(remaining).toBeGreaterThan(118);
    expect(remaining).toBeLessThanOrEqual(120 + (Date.now() - before) / 1000);
  });

  it("#79 cancelling the rest timer (Undo, Skip, Done) clears it", async () => {
    const { cancelRest, startRest } = await import("@/lib/workoutClock");
    startRest(90);
    cancelRest();
    expect(saved().restEndsAt).toBeNull();
  });

  it("ending the workout clears both the start and any running rest", async () => {
    const { setWorkoutStarted, startRest } = await import("@/lib/workoutClock");
    setWorkoutStarted(Date.now());
    startRest(90);
    setWorkoutStarted(null);
    expect(saved()).toEqual({ startedAt: null, restEndsAt: null });
  });
});
