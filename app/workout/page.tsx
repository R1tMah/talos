"use client";

import Link from "next/link";
import { useState } from "react";
import { ActiveWorkout } from "@/components/ActiveWorkout";
import { DataTable } from "@/components/DataTable";
import { FormSheet } from "@/components/FormSheet";
import { LiftCalendar } from "@/components/LiftCalendar";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { unlockAudio } from "@/lib/chime";
import { fmtDay, logicalToday, toHM } from "@/lib/date";
import { useWorkoutData, workoutApi, type HistoryRow } from "@/lib/workoutData";

/** "2026-10-11" + "18:30" -> ISO timestamp in the device's timezone. */
const at = (date: string, hm: string) => new Date(`${date}T${hm || "00:00"}`).toISOString();

export default function WorkoutPage() {
  const { data, failed, reload } = useWorkoutData();
  const [edit, setEdit] = useState<HistoryRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Workout" />
        <p role="alert" className="muted">
          Failed.{" "}
          <button type="button" className="btn btn-sm" onClick={reload}>
            Retry
          </button>
        </p>
      </main>
    ) : (
      <PageSkeleton />
    );
  }

  if (data.active) return <ActiveWorkout data={data} active={data.active} reload={reload} />;

  const start = async (planId: string | null) => {
    unlockAudio(); // must run inside the tap for iOS
    setStarting(true);
    const res = await workoutApi.start(planId, logicalToday());
    setStarting(false);
    setError(res.status !== "saved" && res.status !== "conflict");
    await reload();
  };

  const lastFor = (name: string) => data.history.find((h) => h.planName === name);

  return (
    <main className="screen">
      <ScreenHeader title="Workout" right={<Link href="/tabs/lifts" className="btn btn-sm">Progress</Link>} />

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          Failed
        </p>
      )}
      {notice && (
        <p role="status" className="muted" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      {data.plans.map((p) => {
        const last = lastFor(p.name);
        return (
          <button key={p.id} type="button" className="card plan-card" disabled={starting} onClick={() => start(p.id)}>
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
              {p.exercises.map((e) => e.name).join(", ")}
            </span>
          </button>
        );
      })}

      <button type="button" className="card plan-card" disabled={starting} onClick={() => start(null)}>
        <span className="plan-top">
          <span>
            <span className="plan-name">Empty workout</span>
            <span className="faint" style={{ display: "block", fontSize: "var(--t-sm)", marginTop: 2 }}>
              Add exercises as you go
            </span>
          </span>
          <span className="btn plan-start">Start</span>
        </span>
      </button>

      <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setAdding(true)}>
        + Add exercise
      </button>

      <SectionTitle>Past workouts</SectionTitle>
      <DataTable
        rows={data.history}
        empty="No workouts logged."
        onRowClick={setEdit}
        onDelete={async (r) => {
          await workoutApi.remove(r.id);
          reload();
        }}
        columns={[
          { key: "date", label: "Date", width: "50px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          { key: "plan", label: "Plan", width: "1fr", render: (r) => <div className="cell-main">{r.planName ?? "Workout"}</div> },
          { key: "min", label: "Duration", width: "auto", align: "right", render: (r) => (r.minutes != null ? `${r.minutes} min` : "–") },
          { key: "sets", label: "Sets", width: "36px", align: "right", render: (r) => <span className="muted">{r.sets}</span> },
        ]}
      />

      <SectionTitle>Lifts per week</SectionTitle>
      <LiftCalendar dates={data.history.map((h) => h.date)} />

      {adding && (
        <FormSheet
          title="Add exercise"
          fields={[
            { name: "name", label: "Name", full: true, placeholder: "e.g. Cable crunch" },
            { name: "aliases", label: "Aliases", full: true, placeholder: "Optional, comma separated" },
          ]}
          initial={{}}
          validate={(v) =>
            !String(v.name ?? "").trim()
              ? "Name is required."
              : data.exercises.some((e) => e.name.toLowerCase() === String(v.name).trim().toLowerCase())
                ? "That exercise already exists."
                : null
          }
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            setAdding(false);
            const aliases = String(v.aliases ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
            const res = await workoutApi.addExercise(String(v.name).trim(), aliases);
            setError(res.status !== "saved");
            setNotice(res.status === "saved" ? `Added ${String(v.name).trim()}. Pick it from + Add exercise during any workout.` : null);
            reload();
          }}
        />
      )}

      {edit && (
        <FormSheet
          title="Edit workout"
          confirm
          fields={[
            { name: "date", label: "Date", type: "date" },
            { name: "start", label: "Started", type: "time" },
            { name: "minutes", label: "Minutes", type: "number", optional: true },
          ]}
          initial={{ date: edit.date, start: toHM(new Date(edit.startedAt)), minutes: edit.minutes }}
          validate={(v) => (!v.date ? "Date is required." : v.minutes != null && (!Number.isFinite(v.minutes) || (v.minutes as number) < 0) ? "Minutes must be a number." : null)}
          onClose={() => setEdit(null)}
          onDelete={async () => {
            setEdit(null);
            await workoutApi.remove(edit.id);
            reload();
          }}
          onSubmit={async (v) => {
            setEdit(null);
            const started = at(v.date as string, v.start as string);
            const ended = v.minutes == null ? edit.endedAt : new Date(new Date(started).getTime() + (v.minutes as number) * 60000).toISOString();
            await workoutApi.update(edit.id, v.date as string, started, ended, "done");
            reload();
          }}
        />
      )}
    </main>
  );
}
