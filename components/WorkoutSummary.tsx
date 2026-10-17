"use client";

import { useEffect, useState } from "react";
import { fmtDay, fmtDow, fmtNum, toHM } from "@/lib/date";
import { loadWorkoutSummary, type WorkoutSummary } from "@/lib/workoutData";
import { Sheet } from "./FormSheet";
import { Skel } from "./Skeleton";

const g = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const setText = (weight: number | null, reps: number) => (weight == null ? `BW × ${reps}` : `${g(weight)} × ${reps}`);

/** One workout: when, how long, and every exercise with each set. Numbers only. */
export function WorkoutSummarySheet({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const [w, setW] = useState<WorkoutSummary | null | "failed">(null);

  useEffect(() => {
    let live = true;
    setW(null);
    loadWorkoutSummary(id).then((r) => live && setW(r ?? "failed"));
    return () => {
      live = false;
    };
  }, [id]);

  const title = w && w !== "failed" ? `${w.planName ?? "Workout"}, ${fmtDow(w.date)} ${fmtDay(w.date)}` : "Workout";

  return (
    <Sheet title={title} onClose={onClose}>
      {w === null ? (
        <div style={{ display: "grid", gap: "var(--s-3)" }} aria-busy="true">
          <Skel h={64} r={12} />
          <Skel h={96} r={12} />
          <Skel h={96} r={12} />
        </div>
      ) : w === "failed" ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          Failed
        </p>
      ) : (
        <>
          <div className="card strip">
            <div>
              <span className="label">Time</span>
              <span className="strip-value num" style={{ fontSize: "var(--t-lg)" }}>
                {toHM(new Date(w.startedAt))}
              </span>
              <span className="strip-sub num">{w.endedAt ? `to ${toHM(new Date(w.endedAt))}` : "not finished"}</span>
            </div>
            <div>
              <span className="label">Duration</span>
              <span className="strip-value num" style={{ fontSize: "var(--t-lg)" }}>
                {w.minutes != null ? w.minutes : "–"}
                {w.minutes != null && <small>min</small>}
              </span>
            </div>
            <div>
              <span className="label">Sets</span>
              <span className="strip-value num" style={{ fontSize: "var(--t-lg)" }}>
                {w.totalSets}
              </span>
            </div>
            <div>
              <span className="label">Volume</span>
              <span className="strip-value num" style={{ fontSize: "var(--t-lg)" }}>
                {fmtNum(w.volume)}
                <small>lb</small>
              </span>
            </div>
          </div>

          {w.exercises.length === 0 ? (
            <p className="faint" style={{ fontSize: "var(--t-sm)" }}>
              No sets logged.
            </p>
          ) : (
            <div className="wsum-list">
              {w.exercises.map((ex) => (
                <section key={ex.id} className="card wsum-ex">
                  <div className="wsum-head">
                    <span className="wsum-name">{ex.name}</span>
                    <span className="faint num" style={{ fontSize: "var(--t-xs)" }}>
                      {ex.e1rm != null ? `e1RM ${g(ex.e1rm)}` : ex.best ? `best ${ex.best.reps} reps` : ""}
                    </span>
                  </div>
                  <ol className="wsum-sets num">
                    {ex.sets.map((s) => (
                      <li key={s.id}>
                        <span className="faint">{s.setNumber}</span>
                        <span>{setText(s.weight, s.reps)}</span>
                        {s.variant && <span className="faint">{s.variant}</span>}
                      </li>
                    ))}
                  </ol>
                  <div className="wsum-foot faint num">
                    {ex.sets.length} {ex.sets.length === 1 ? "set" : "sets"}
                    {ex.volume > 0 && ` · ${fmtNum(ex.volume)} lb volume`}
                    {ex.best && ` · top set ${setText(ex.best.weight, ex.best.reps)}`}
                  </div>
                </section>
              ))}
            </div>
          )}

          {w.skipped.length > 0 && (
            <p className="faint" style={{ fontSize: "var(--t-sm)", margin: "var(--s-3) 0 0" }}>
              Skipped: {w.skipped.join(", ")}
            </p>
          )}

          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onEdit}>
              Edit date and time
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
