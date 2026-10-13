"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { LiftChart, type LiftPoint } from "@/components/LiftChart";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { fmtDay } from "@/lib/date";
import { useLiftDays, type LiftDay } from "@/lib/workoutData";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const bestSet = (d: LiftDay) => (d.bestWeight == null ? `BW × ${d.maxReps}` : `${fmt(d.bestWeight)} × ${d.bestReps}`);

/**
 * Progression for one lift. Weighted lifts plot the estimated one-rep max
 * (Epley: weight × (1 + reps / 30), from each day's best set); bodyweight lifts
 * plot the most reps in a set. Numbers only, no trend commentary.
 */
export default function LiftsPage() {
  const { data, failed, reload } = useLiftDays();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const logged = useMemo(() => {
    const last = new Map<string, string>();
    for (const d of data?.days ?? []) last.set(d.exerciseId, d.date);
    return last;
  }, [data]);

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Lifts" back="/tabs" />
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

  // Lifts with sets first (most recently done first), then the rest alphabetically.
  const ordered = [...data.exercises].sort((a, b) => {
    const la = logged.get(a.id) ?? "";
    const lb = logged.get(b.id) ?? "";
    return la === lb ? a.name.localeCompare(b.name) : lb.localeCompare(la);
  });
  const query = q.trim().toLowerCase();
  const options = query ? ordered.filter((e) => [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(query))) : ordered;
  const selectedId = picked && options.some((e) => e.id === picked) ? picked : (options[0]?.id ?? null);
  const exercise = data.exercises.find((e) => e.id === selectedId) ?? null;

  const days = data.days.filter((d) => d.exerciseId === selectedId);
  const weighted = days.some((d) => d.e1rm != null);
  const points: LiftPoint[] = days
    .filter((d) => (weighted ? d.e1rm != null : true))
    .map((d) => ({ date: d.date, value: weighted ? d.e1rm! : d.maxReps, detail: bestSet(d) }));

  const latest = points.at(-1);
  const best = points.reduce<LiftPoint | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const unit = weighted ? "lb" : "reps";

  return (
    <main className="screen">
      <ScreenHeader title="Lifts" back="/tabs" />

      <div style={{ display: "grid", gap: "var(--s-2)" }}>
        <input className="input" type="search" placeholder="Search lifts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search lifts" />
        <select
          className="input"
          aria-label="Lift"
          value={selectedId ?? ""}
          onChange={(e) => setPicked(e.target.value)}
          disabled={!options.length}
        >
          {!options.length && <option value="">No lift matches</option>}
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {logged.has(e.id) ? "" : " (no sets yet)"}
            </option>
          ))}
        </select>
      </div>

      {exercise && (
        <>
          <SummaryStrip
            items={[
              { label: "Latest", value: latest ? fmt(latest.value) : "–", unit: latest ? unit : undefined, sub: latest ? fmtDay(latest.date) : "" },
              { label: "Best", value: best ? fmt(best.value) : "–", unit: best ? unit : undefined, sub: best ? fmtDay(best.date) : "" },
              { label: "Days", value: days.length, sub: "logged" },
            ]}
          />

          <LiftChart points={points} label={weighted ? "Estimated 1RM" : "Most reps in a set"} unit={unit} />
          {weighted && (
            <p className="faint" style={{ fontSize: "var(--t-xs, 12px)", margin: 0 }}>
              Estimated 1RM = weight × (1 + reps ÷ 30), from each day&rsquo;s best set.
            </p>
          )}

          <SectionTitle>{exercise.name}</SectionTitle>
          <DataTable
            rows={[...days].reverse().map((d) => ({ ...d, id: d.date }))}
            empty="No sets logged for this lift yet."
            columns={[
              { key: "date", label: "Date", width: "1fr", render: (r) => fmtDay(r.date) },
              { key: "best", label: "Best set", width: "auto", align: "right", render: (r) => <span className="num">{bestSet(r)}</span> },
              ...(weighted
                ? [{ key: "e1rm", label: "e1RM", width: "52px", align: "right" as const, render: (r: LiftDay) => (r.e1rm != null ? fmt(r.e1rm) : "–") }]
                : []),
              { key: "sets", label: "Sets", width: "36px", align: "right", render: (r) => <span className="muted">{r.sets}</span> },
            ]}
          />
        </>
      )}
    </main>
  );
}
