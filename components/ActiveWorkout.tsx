"use client";

import { useEffect, useMemo, useState } from "react";
import { unlockAudio } from "@/lib/chime";
import { fmtClock } from "@/lib/date";
import { cancelRest, setRestEndsAt, startRest, useWorkoutClock } from "@/lib/workoutClock";
import { VARIANTS, workoutApi, type Active, type Exercise, type LoggedSet, type WorkoutData } from "@/lib/workoutData";
import { FormSheet, Sheet } from "./FormSheet";
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

const matches = (e: Exercise, q: string) => [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(q.trim().toLowerCase()));
const fmtSet = (s: Pick<LoggedSet, "weight" | "reps">) => (s.weight == null ? `BW×${s.reps}` : `${s.weight}×${s.reps}`);

/** Search every exercise, or create a new one: how a workout diverges from its plan. */
function AddExercise({ data, onPick, onClose }: { data: WorkoutData; onPick: (e: Exercise) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const hits = data.exercises.filter((e) => matches(e, q)).slice(0, 12);
  const exact = data.exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const create = async () => {
    setBusy(true);
    const r = await workoutApi.addExercise(q.trim());
    setBusy(false);
    const row = (r.status === "saved" ? r.row : r.status === "conflict" ? r.existing : null) as Exercise | null | undefined;
    if (row) onPick({ id: String(row.id), name: String(row.name), aliases: (row.aliases as string[]) ?? [] });
  };

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <input className="input" type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="card table" style={{ marginTop: "var(--s-3)", maxHeight: 320, overflowY: "auto" }}>
        {hits.map((e) => (
          <button key={e.id} type="button" className="tr clickable" style={{ gridTemplateColumns: "1fr", width: "100%", textAlign: "left" }} onClick={() => onPick(e)}>
            <span className="cell-main">{e.name}</span>
          </button>
        ))}
        {!hits.length && <div className="empty">No match.</div>}
      </div>
      {q.trim() && !exact && (
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
            Create &ldquo;{q.trim()}&rdquo;
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function ActiveWorkout({ data, active, reload }: { data: WorkoutData; active: Active; reload: () => Promise<void> }) {
  const { restEndsAt } = useWorkoutClock();
  const byId = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);
  const planExercises = data.plans.find((p) => p.id === active.planId)?.exercises ?? [];

  // The plan's exercises in order, then anything else logged or added this workout.
  const [added, setAdded] = useState<string[]>([]);
  // Exercises skipped for today drop out of the list and sit in a "Skipped" row below it.
  const skipped = useMemo(() => new Set(active.skipped), [active.skipped]);
  const list: Exercise[] = useMemo(() => {
    const ids = [...planExercises.map((e) => e.id), ...active.sets.map((s) => s.exerciseId), ...added];
    return [...new Set(ids)].filter((id) => !skipped.has(id)).map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
  }, [planExercises, active.sets, added, byId, skipped]);
  const skippedList = active.skipped.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);

  const [current, setCurrent] = useState<string | null>(null);
  const cur = current && list.some((e) => e.id === current) ? current : (list[0]?.id ?? null);
  const curName = cur ? byId.get(cur)?.name ?? "" : "";
  const variants = VARIANTS[curName];

  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState<null | "discard">(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LoggedSet | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useWakeLock();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const setsFor = (id: string) => active.sets.filter((s) => s.exerciseId === id);

  // Prefill from this workout's last set of the lift, else the last time it was done.
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [variant, setVariant] = useState("");
  useEffect(() => {
    if (!cur) return;
    const last = setsFor(cur).at(-1);
    const ref = last ?? data.lastBest[cur];
    setWeight(ref?.weight != null ? String(ref.weight) : "");
    setReps(ref ? String(ref.reps) : "");
    setVariant(last?.variant ?? "");
    // Only when the selected lift changes or a set is logged.
  }, [cur, active.sets.length]);

  const logSet = async () => {
    unlockAudio(); // the rest chime needs a tap on iOS
    const r = Number(reps);
    if (!cur || !Number.isInteger(r) || r <= 0 || busy) return;
    const w = weight.trim() === "" ? null : Number(weight);
    if (w != null && (!Number.isFinite(w) || w < 0)) return;
    setBusy(true);
    const res = await workoutApi.logSet(active.id, cur, r, w, variant || null);
    setBusy(false);
    setError(res.status !== "saved");
    // The rest countdown only starts after a set is actually saved.
    if (res.status === "saved") startRest(data.restSeconds);
    await reload();
  };

  const finish = async () => {
    setBusy(true);
    const res = await workoutApi.update(active.id, active.date, new Date(active.startedAt).toISOString(), new Date().toISOString(), "done");
    setBusy(false);
    if (res.status !== "saved") return setError(true);
    cancelRest();
    await reload();
  };

  const discard = async () => {
    const res = await workoutApi.remove(active.id);
    if (res.status !== "saved") return setError(true);
    cancelRest();
    await reload();
  };

  const skip = async (exerciseId: string, value: boolean) => {
    const res = await workoutApi.setSkipped(active.id, exerciseId, value);
    setError(res.status !== "saved" && res.status !== "has_sets");
    await reload();
  };

  const nudge = (sec: number) => restEndsAt && setRestEndsAt(Math.max(Date.now() + 1000, restEndsAt + sec * 1000));

  return (
    <div className="wo">
      <div className="wo-inner">
        <div className="wo-top">
          {ending === "discard" ? (
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" style={{ color: "var(--danger)" }} onClick={discard}>
                Discard
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEnding(null)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEnding("discard")}>
              Discard
            </button>
          )}
          <span className="label">{active.planName ?? "Workout"}</span>
          <button type="button" className="btn btn-sm" style={{ color: "var(--accent)" }} disabled={busy} onClick={finish}>
            Done
          </button>
        </div>

        <div className="wo-elapsed num">{fmtClock((now - active.startedAt) / 1000)}</div>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0, textAlign: "center" }}>
            Failed
          </p>
        )}

        <div className="wo-ring">
          {/* Chime and flash at zero come from RestWatcher, so they also fire on other tabs. */}
          <TimerRing endsAt={restEndsAt} total={data.restSeconds} size={184} />
          <div className="wo-ring-actions" style={{ visibility: restEndsAt && restEndsAt > now ? "visible" : "hidden" }}>
            <button type="button" className="btn btn-sm" onClick={() => nudge(-15)}>
              −15
            </button>
            <button type="button" className="btn btn-sm" onClick={cancelRest}>
              Skip
            </button>
            <button type="button" className="btn btn-sm" onClick={() => nudge(15)}>
              +15
            </button>
          </div>
        </div>

        <div className="wo-list">
          {list.map((ex) => {
            const sets = setsFor(ex.id);
            return (
              <div key={ex.id} role="button" tabIndex={0} className="ex" aria-pressed={ex.id === cur} onClick={() => setCurrent(ex.id)}>
                <span className="ex-name">
                  <span>{ex.name}</span>
                  {sets.length ? (
                    <span className="faint num" style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>
                      {sets.length}
                    </span>
                  ) : (
                    // Only lifts with nothing logged can be skipped for today.
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm ex-skip"
                      aria-label={`Skip ${ex.name} today`}
                      onClick={(e) => {
                        e.stopPropagation();
                        skip(ex.id, true);
                      }}
                    >
                      Skip
                    </button>
                  )}
                </span>
                <span className="sets">
                  {sets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="set-chip num"
                      aria-label={`Edit set ${s.setNumber}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(s);
                      }}
                    >
                      {fmtSet(s)}
                      {s.variant ? ` ${s.variant[0]}` : ""}
                    </button>
                  ))}
                  {ex.id === cur && <span className="set-chip empty">+</span>}
                </span>
              </div>
            );
          })}
          {skippedList.length > 0 && (
            <div className="ex-skipped">
              <span className="label">Skipped today</span>
              <span className="sets">
                {skippedList.map((ex) => (
                  <button key={ex.id} type="button" className="set-chip empty" aria-label={`Bring back ${ex.name}`} onClick={() => skip(ex.id, false)}>
                    {ex.name} ↺
                  </button>
                ))}
              </span>
            </div>
          )}
          <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setAdding(true)}>
            + Add exercise
          </button>
        </div>

        {cur && (
          <form
            className="wo-entry"
            onSubmit={(e) => {
              e.preventDefault();
              logSet();
            }}
          >
            <label className="field">
              <span className="label">lb</span>
              <input className="input num" inputMode="decimal" placeholder="BW" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Reps</span>
              <input className="input num" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
            </label>
            {variants && (
              <label className="field">
                <span className="label">Type</span>
                <select className="input" value={variant} onChange={(e) => setVariant(e.target.value)}>
                  <option value="">–</option>
                  {variants.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className="btn btn-primary" disabled={!reps || busy}>
              Log set
            </button>
          </form>
        )}
      </div>

      {adding && (
        <AddExercise
          data={data}
          onClose={() => setAdding(false)}
          onPick={(e) => {
            setAdded((a) => [...a, e.id]);
            setCurrent(e.id);
            setAdding(false);
            reload();
          }}
        />
      )}

      {editing && (
        <FormSheet
          title={`${byId.get(editing.exerciseId)?.name ?? "Set"}, set ${editing.setNumber}`}
          confirm
          fields={[
            { name: "weight", label: "Weight (lb, blank = bodyweight)", type: "number", optional: true },
            { name: "reps", label: "Reps", type: "number" },
            ...(VARIANTS[byId.get(editing.exerciseId)?.name ?? ""]
              ? [{ name: "variant", label: "Type", type: "select" as const, options: ["", ...VARIANTS[byId.get(editing.exerciseId)!.name]] }]
              : []),
          ]}
          initial={{ weight: editing.weight, reps: editing.reps, variant: editing.variant ?? "" }}
          validate={(v) => (!Number.isInteger(v.reps) || (v.reps as number) <= 0 ? "Reps must be a whole number." : null)}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            setEditing(null);
            await workoutApi.deleteSet(editing.id);
            reload();
          }}
          onSubmit={async (v) => {
            setEditing(null);
            await workoutApi.updateSet(editing.id, v.reps as number, (v.weight as number | null) ?? null, (v.variant as string) || null);
            reload();
          }}
        />
      )}
    </div>
  );
}
