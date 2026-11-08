"use client";

import { useState, type ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { IconChevron } from "@/components/Icons";
import { LiftChart, type LiftPoint } from "@/components/LiftChart";
import { LiftoffImport } from "@/components/LiftoffImport";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtDow, weekStart } from "@/lib/date";
import { BIG_THREE, exerciseNames, PPL, repsFor, sessions, sessionsFor, setText, shortDuration, splitOf, SPLITS, type LiftSet, type SessionPoint } from "@/lib/liftoff";
import { useWorkoutLog } from "@/lib/liftoffData";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A choice in the picker: one exercise, or Hammer Curls (its three variations as one lift). */
interface Choice {
  id: string;
  label: string;
  names: readonly string[];
  group: string; // Push, Pull, Legs or Other
}

const HAMMER = BIG_THREE.find((b) => b.key === "hammer")!;

/** Every exercise with sets, grouped by the split in its listed order; Hammer Curls (all) leads Pull when any curl was done. */
function choices(sets: LiftSet[]): Choice[] {
  const done = new Map(exerciseNames(sets).map((n) => [n.toLowerCase(), n]));
  const out: Choice[] = [];
  for (const sp of SPLITS) {
    if (sp === "Pull" && HAMMER.names.some((n) => done.has(n.toLowerCase()))) {
      out.push({ id: "hammer-all", label: "Hammer Curls (all three)", names: HAMMER.names, group: sp });
    }
    for (const n of PPL[sp]) {
      const name = done.get(n.toLowerCase());
      if (name) out.push({ id: name, label: name, names: [name], group: sp });
    }
  }
  for (const n of [...done.values()].filter((n) => !splitOf(n)).sort()) out.push({ id: n, label: n, names: [n], group: "Other" });
  return out;
}

/**
 * Lifts, the second half of the Nutrition page (Nutrition | Lifts), from Liftoff exports (Import here, or paste into Chat). Search or pick an exercise to
 * see its estimated 1RM over time (weight × (1 + reps ÷ 30), each session's best set), or most
 * reps for bodyweight work; then every session, week by week.
 */
export function LiftsScreen({ switcher }: { switcher?: ReactNode }) {
  const { sets, failed, reload } = useWorkoutLog();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const importButton = (
    <button type="button" className="btn btn-sm" onClick={() => setImporting(true)}>
      Import
    </button>
  );
  const sheet = importing && (
    <LiftoffImport
      onClose={() => setImporting(false)}
      onDone={(m) => {
        setImporting(false);
        setNotice(m);
        reload();
      }}
    />
  );

  if (!sets) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Nutrition" back="/tabs" />
        {switcher}
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

  if (!sets.length) {
    return (
      <main className="screen">
        <ScreenHeader title="Nutrition" back="/tabs" right={importButton} />
      {switcher}
        <div className="card pad">
          <p style={{ margin: 0 }}>No lifts yet.</p>
          <p className="faint" style={{ fontSize: "var(--t-sm)", margin: "6px 0 var(--s-3)" }}>
            In Liftoff, export your workouts as CSV, then import it here (or paste it into Chat). Importing the same workouts again replaces them, so overlapping exports are fine.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
            Import from Liftoff
          </button>
        </div>
        {sheet}
      </main>
    );
  }

  const all = choices(sets);
  const query = q.trim().toLowerCase();
  const shown = query ? all.filter((c) => c.label.toLowerCase().includes(query) || c.names.some((n) => n.toLowerCase().includes(query))) : all;
  // The picked one if it still matches the search; otherwise the exercise done most recently among the matches.
  const lastDone = (c: Choice) => sets.reduce((m, s) => (c.names.some((n) => n.toLowerCase() === s.exercise.toLowerCase()) && s.date > m ? s.date : m), "");
  const current = shown.find((c) => c.id === picked) ?? [...shown].sort((a, b) => lastDone(b).localeCompare(lastDone(a)))[0] ?? null;
  const groups = [...new Set(shown.map((c) => c.group))];

  return (
    <main className="screen">
      <ScreenHeader title="Nutrition" back="/tabs" right={importButton} />
      {switcher}
      {notice && (
        <p role="status" className="muted" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <div className="lift-pick">
        <input className="input" type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
        <select className="input" aria-label="Exercise" value={current?.id ?? ""} disabled={!shown.length} onChange={(e) => setPicked(e.target.value)}>
          {!shown.length && <option value="">No exercise matches</option>}
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {shown.filter((c) => c.group === g).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {current && <ExerciseView key={current.id} choice={current} sets={sets} />}

      <History sets={sets} />
      {sheet}
    </main>
  );
}

/** One exercise: latest, best and session count, its chart, and each session's best set. */
function ExerciseView({ choice, sets }: { choice: Choice; sets: LiftSet[] }) {
  const weighted = sessionsFor(sets, choice.names);
  const bodyweight = weighted.length === 0;
  const pts: SessionPoint[] = bodyweight ? repsFor(sets, choice.names) : weighted;
  const unit = bodyweight ? "reps" : "lb";
  const latest = pts.at(-1);
  const best = pts.reduce<SessionPoint | null>((m, p) => (!m || p.e1rm > m.e1rm ? p : m), null);
  const points: LiftPoint[] = pts.map((p) => ({ date: p.date, value: p.e1rm, detail: choice.names.length > 1 ? `${p.best}, ${p.exercise}` : p.best }));

  return (
    <>
      <SummaryStrip
        grid
        items={[
          { label: bodyweight ? "Latest" : "Latest 1RM", value: latest ? fmt(latest.e1rm) : "–", unit: latest ? unit : undefined, sub: latest ? fmtDay(latest.date) : "" },
          { label: bodyweight ? "Best" : "Best 1RM", value: best ? fmt(best.e1rm) : "–", unit: best ? unit : undefined, sub: best ? fmtDay(best.date) : "" },
          { label: "Sessions", value: pts.length },
          { label: "Last set", value: latest ? latest.best : "–" },
        ]}
      />
      <LiftChart points={points} label={bodyweight ? "Most reps in a set" : "Estimated 1RM"} unit={unit} />
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: 0 }}>
        {bodyweight
          ? "Bodyweight, so no 1RM: the most reps in a set each session."
          : "Estimated 1RM = weight × (1 + reps ÷ 30), from each session’s best set. Weights as exported from Liftoff."}
      </p>
      <DataTable
        rows={[...pts].reverse().map((p) => ({ ...p, id: `${p.date}-${p.best}-${p.exercise}` }))}
        empty="No sets for this exercise."
        columns={[
          { key: "date", label: "Date", width: "1fr", render: (r) => fmtDay(r.date) },
          { key: "best", label: "Best set", width: "auto", align: "right", render: (r) => <span className="num">{r.best}</span> },
          ...(bodyweight ? [] : [{ key: "e1rm", label: "1RM", width: "52px", align: "right" as const, render: (r: SessionPoint) => fmt(r.e1rm) }]),
        ]}
      />
    </>
  );
}

/** The raw sessions, newest week first: each workout's exercises and sets, as exported. */
function History({ sets }: { sets: LiftSet[] }) {
  const all = sessions(sets);
  const weeks = new Map<string, typeof all>();
  for (const s of all) {
    const wk = weekStart(s.date);
    weeks.set(wk, [...(weeks.get(wk) ?? []), s]);
  }
  return (
    <>
      <span className="label group-title">History</span>
      {[...weeks].map(([wk, list], i) => (
        <details key={wk} className="card archived-acc" open={i === 0}>
          <summary>
            <span className="label num">
              Week of {fmtDay(wk)} · {list.length} {list.length === 1 ? "workout" : "workouts"}
            </span>
            <IconChevron />
          </summary>
          {list.map((s) => (
            // Each day folds on its own: closed, it's the workout, date and length.
            <details key={s.key} className="lift-day">
              <summary>
                <span className="lift-day-title">
                  <span className="cell-main">{s.workout}</span>
                  <span className="faint num" style={{ fontSize: "var(--t-xs)" }}>
                    {fmtDow(s.date)} {fmtDay(s.date)}
                    {s.duration ? ` · ${shortDuration(s.duration)}` : ""} · {s.exercises.length} {s.exercises.length === 1 ? "exercise" : "exercises"}
                  </span>
                </span>
                <IconChevron />
              </summary>
              <div className="lift-session">
                {s.exercises.map((e) => (
                  <div key={e.name} className="lift-session-ex">
                    <span>{e.name}</span>
                    <span className="num muted">{e.sets.map(setText).join(" · ")}</span>
                    {/* The same note on every set is shown once. */}
                    {[...new Set(e.sets.map((x) => x.notes).filter(Boolean))].map((n) => (
                      <span key={n} className="faint lift-note">{n}</span>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </details>
      ))}
    </>
  );
}
