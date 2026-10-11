"use client";

import { useEffect, useState } from "react";
import { fmtClock, toHM, toISO, uid } from "@/lib/date";
import { unlockAudio } from "@/lib/chime";
import { useStore } from "@/lib/store";
import type { Session } from "@/lib/types";
import { logSet as addSet } from "@/lib/workoutChat";
import { TimerRing } from "./TimerRing";

/** Keep the screen on while mounted; re-acquire after the app returns to foreground. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    const onVis = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);
}

export function ActiveWorkout({ session }: { session: Session }) {
  const { db, mutate } = useStore();
  const plan = db.plans.find((p) => p.name === session.plan);
  const exercises = plan?.exercises ?? [...new Set(session.sets.map((s) => s.exercise))];
  const restSec = db.settings.restSec;

  const [now, setNow] = useState(Date.now());
  const [discarding, setDiscarding] = useState(false);
  useWakeLock();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const setsFor = (ex: string) => session.sets.filter((s) => s.exercise === ex);
  const last = setsFor(session.current).at(-1);
  const prevSession = [...db.workouts].filter((w) => w.plan === session.plan && !w.deleted).sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevSet = prevSession?.sets.find((s) => s.exercise === session.current);

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  useEffect(() => {
    const ref = last ?? prevSet;
    setWeight(ref ? String(ref.weight) : "");
    setReps(ref ? String(ref.reps) : "");
    // Prefill only when the selected exercise changes or a set is logged.
  }, [session.current, session.sets.length]);

  const patch = (p: Partial<Session>) => mutate((d) => (d.session ? { ...d, session: { ...d.session, ...p } } : d));

  const logSet = () => {
    unlockAudio();
    const r = Number(reps);
    if (!r) return;
    mutate((d) => addSet(d, { exercise: session.current, weight: Number(weight), reps: r }));
  };

  const finish = () =>
    mutate((d) => {
      if (!d.session) return d;
      const start = new Date(d.session.startedAt);
      const minutes = Math.max(1, Math.round((Date.now() - d.session.startedAt) / 60000));
      const w = { id: uid(), date: toISO(start), time: toHM(start), plan: d.session.plan, minutes, sets: d.session.sets };
      return { ...d, session: null, workouts: d.session.sets.length ? [...d.workouts, w] : d.workouts };
    });

  const nudge = (sec: number) =>
    session.restEndsAt && patch({ restEndsAt: Math.max(Date.now() + 1000, session.restEndsAt + sec * 1000) });

  return (
    <div className="wo">
      <div className="wo-inner">
        <div className="wo-top">
          {discarding ? (
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" style={{ color: "var(--danger)" }} onClick={() => mutate((d) => ({ ...d, session: null }))}>
                Discard
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setDiscarding(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDiscarding(true)}>
              Discard
            </button>
          )}
          <span className="label">{session.plan}</span>
          <button type="button" className="btn btn-sm" style={{ color: "var(--accent)" }} onClick={finish}>
            Finish
          </button>
        </div>

        <div className="wo-elapsed num">{fmtClock((now - session.startedAt) / 1000)}</div>

        <div className="wo-ring">
          {/* Chime and flash at zero come from RestWatcher, so they also fire on other tabs. */}
          <TimerRing endsAt={session.restEndsAt} total={restSec} size={184} />
          <div className="wo-ring-actions" style={{ visibility: session.restEndsAt && session.restEndsAt > now ? "visible" : "hidden" }}>
            <button type="button" className="btn btn-sm" onClick={() => nudge(-15)}>
              −15
            </button>
            <button type="button" className="btn btn-sm" onClick={() => patch({ restEndsAt: null })}>
              Skip
            </button>
            <button type="button" className="btn btn-sm" onClick={() => nudge(15)}>
              +15
            </button>
          </div>
        </div>

        <div className="wo-list">
          {exercises.map((ex) => {
            const sets = setsFor(ex);
            return (
              <button key={ex} type="button" className="ex" aria-pressed={ex === session.current} onClick={() => patch({ current: ex })}>
                <span className="ex-name">
                  <span>{ex}</span>
                  <span className="faint num" style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>
                    {sets.length || ""}
                  </span>
                </span>
                <span className="sets">
                  {sets.map((s, i) => (
                    <span key={i} className="set-chip num">
                      {s.weight}×{s.reps}
                    </span>
                  ))}
                  {ex === session.current && <span className="set-chip empty">+</span>}
                </span>
              </button>
            );
          })}
        </div>

        <form
          className="wo-entry"
          onSubmit={(e) => {
            e.preventDefault();
            logSet();
          }}
        >
          <label className="field">
            <span className="label">lb</span>
            <input className="input num" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Reps</span>
            <input className="input num" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!reps}>
            Log set
          </button>
        </form>
      </div>
    </div>
  );
}
