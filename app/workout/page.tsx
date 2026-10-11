"use client";

import { useMemo, useState } from "react";
import { ActiveWorkout } from "@/components/ActiveWorkout";
import { DataTable } from "@/components/DataTable";
import { FormSheet } from "@/components/FormSheet";
import { LiftCalendar } from "@/components/LiftCalendar";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { unlockAudio } from "@/lib/chime";
import { fmtDay, newestFirst } from "@/lib/date";
import { live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import { startSession } from "@/lib/workoutChat";
import type { Workout } from "@/lib/types";

export default function WorkoutPage() {
  const { db, mutate, update, remove } = useStore();
  const [edit, setEdit] = useState<Workout | null>(null);
  const history = useMemo(() => live(db.workouts).sort(newestFirst), [db.workouts]);

  if (db.session) return <ActiveWorkout session={db.session} />;

  const plans = live(db.plans);

  return (
    <main className="screen">
      <ScreenHeader title="Workout" />

      {plans.map((p) => {
        const last = history.find((w) => w.plan === p.name);
        return (
          <button
            key={p.id}
            type="button"
            className="card plan-card"
            onClick={() => {
              unlockAudio(); // must run inside the tap for iOS
              mutate((d) => startSession(d, p));
            }}
          >
            <span className="plan-top">
              <span>
                <span className="plan-name">{p.name}</span>
                <span className="faint num" style={{ display: "block", fontSize: "var(--t-sm)", marginTop: 2 }}>
                  {last ? `Last ${fmtDay(last.date)}` : "Not done yet"}
                </span>
              </span>
              <span className="btn btn-primary plan-start">Start</span>
            </span>
            <span className="muted" style={{ fontSize: "var(--t-sm)" }}>
              {p.exercises.join(", ")}
            </span>
          </button>
        );
      })}

      <SectionTitle>Past workouts</SectionTitle>
      <DataTable
        rows={history}
        empty="No workouts logged."
        onRowClick={setEdit}
        onDelete={(r) => remove("workouts", r.id)}
        columns={[
          { key: "date", label: "Date", width: "50px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          { key: "plan", label: "Plan", width: "1fr", render: (r) => <div className="cell-main">{r.plan}</div> },
          { key: "min", label: "Duration", width: "auto", align: "right", render: (r) => `${r.minutes} min` },
          { key: "sets", label: "Sets", width: "36px", align: "right", render: (r) => <span className="muted">{r.sets.length}</span> },
        ]}
      />

      <SectionTitle>Lifts per week</SectionTitle>
      <LiftCalendar workouts={history} />

      {edit && (
        <FormSheet
          title="Edit workout"
          confirm
          fields={[
            { name: "plan", label: "Plan", type: "select", options: plans.map((p) => p.name), full: true },
            { name: "date", label: "Date", type: "date" },
            { name: "time", label: "Time", type: "time" },
            { name: "minutes", label: "Minutes", type: "number" },
          ]}
          initial={edit}
          onClose={() => setEdit(null)}
          onDelete={() => (remove("workouts", edit.id), setEdit(null))}
          onSubmit={(v) => {
            update("workouts", edit.id, v as Partial<Workout>);
            setEdit(null);
          }}
        />
      )}
    </main>
  );
}
