"use client";

import { ArchiveButton, ArchivedBar } from "@/components/TabArchive";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, type Field } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Segmented, Tag } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import {
  leetcodeApi, useLeetcodeData,
  type Attempt, type AttemptInput, type Counts, type Difficulty, type Hints, type Result, type WriteResult,
} from "@/lib/leetcodeData";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const RESULTS: Result[] = ["optimal", "suboptimal", "failed"];
const HINTS: Hints[] = ["none", "small", "multiple"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 28.23 -> "28:14"; times are stored as decimal minutes. */
function fmtMin(m: number | null) {
  if (m == null) return "–";
  const whole = Math.floor(m);
  const s = Math.round((m - whole) * 60);
  return s === 60 ? `${whole + 1}:00` : `${whole}:${String(s).padStart(2, "0")}`;
}

const firstLine = (s: string | null) => s?.split("\n").find((l) => l.trim()) ?? "";

function fields(row?: Attempt): Field[] {
  const inf = row?.inferred ? "inferred" : undefined;
  return [
    { name: "title", label: "Problem", full: true },
    { name: "date", label: "Date", type: "date" },
    { name: "minutes", label: "Minutes", type: "number", optional: true, placeholder: "Optional" },
    { name: "result", label: "Result", type: "select", options: ["", ...RESULTS] },
    { name: "hints", label: "Hints", type: "select", options: ["", ...HINTS] },
    { name: "redo", label: "In redo queue", type: "toggle" },
    { name: "notes", label: "Notes", type: "textarea", trim: false, placeholder: "Approach, where you got stuck, what to remember" },
    // The catalog decides these for known problems; they only matter for problems it doesn't have.
    { name: "difficulty", label: "Difficulty (if not in catalog)", type: "select", options: ["", ...DIFFICULTIES], badge: inf },
    { name: "topic", label: "Topic (if not in catalog)", badge: inf },
  ];
}

function validate(v: Record<string, unknown>) {
  if (!String(v.title ?? "").trim()) return "Problem is required.";
  if (!v.date) return "Date is required.";
  if (v.minutes != null && (!Number.isFinite(v.minutes) || (v.minutes as number) < 0)) return "Minutes must be a number.";
  return null;
}

const blank = <T extends string>(v: unknown) => ((v as string) || null) as T | null;

const inputOf = (v: Record<string, unknown>): AttemptInput => ({
  date: v.date as string,
  title: String(v.title).trim(),
  minutes: (v.minutes as number | null) ?? null,
  hints: blank<Hints>(v.hints),
  result: blank<Result>(v.result),
  redo: Boolean(v.redo),
  notes: (v.notes as string) || null,
  difficulty: blank<Difficulty>(v.difficulty),
  topic: String(v.topic ?? "").trim() || null,
});

/** One line of counts, e.g. Medium 52 · Hard 5. Only keys with a count show. */
function CountLine({ label, counts, order }: { label: string; counts?: Record<string, number>; order?: string[] }) {
  const keys = order ? order.filter((k) => counts?.[k]) : Object.keys(counts ?? {}).sort((a, b) => counts![b] - counts![a]);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className="label" style={{ minWidth: 72 }}>
        {label}
      </span>
      {keys.length === 0 ? (
        <span className="faint">–</span>
      ) : (
        keys.map((k) => (
          <Tag key={k} tone="tag-outline">
            {cap(k)} <span className="num">{counts![k]}</span>
          </Tag>
        ))
      )}
    </div>
  );
}

export default function LeetCodePage() {
  const { data, failed, reload } = useLeetcodeData();
  const [sheet, setSheet] = useState<Attempt | "new" | null>(null);
  const [range, setRange] = useState<"week" | "all">("week");
  const [filter, setFilter] = useState<{ difficulty: string; topic: string; result: string }>({ difficulty: "", topic: "", result: "" });
  const [notice, setNotice] = useState<string | null>(null);

  const log = useMemo(() => data?.log ?? [], [data]);
  const topics = useMemo(() => [...new Set(log.map((a) => a.topic).filter(Boolean) as string[])].sort(), [log]);
  const shown = log.filter(
    (a) =>
      (!filter.difficulty || a.difficulty === filter.difficulty) &&
      (!filter.topic || a.topic === filter.topic) &&
      (!filter.result || (a.result ?? "unstated") === filter.result),
  );

  /** Runs a write, reloads, and turns anything but a save into a plain message. */
  const run = async (write: Promise<WriteResult>) => {
    setNotice(null);
    const r = await write;
    if (r.status === "ambiguous") setNotice(`That name matches more than one problem: ${r.candidates.join(", ")}. Use the full title.`);
    else if (r.status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="LeetCode" back="/tabs" />
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

  const one = (c: Counts, dim: string) => c[dim]?.all ?? 0;
  const counts: Counts = range === "week" ? data.week : data.all;

  return (
    <main className="screen">
      <ScreenHeader title="LeetCode" back="/tabs" right={<><ArchiveButton tab="leetcode" /><ExportButton tab="leetcode" live="leetcode" /></>} />
      <ArchivedBar tab="leetcode" />

      <SummaryStrip
        items={[
          { label: "This week", value: one(data.week, "problems"), sub: "problems" },
          { label: "Days", value: one(data.week, "days"), sub: "this week" },
          { label: "Redo queue", value: data.redo.length },
          { label: "Total", value: one(data.all, "problems"), sub: "problems" },
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <SectionTitle>Redo queue</SectionTitle>
      <div className="card">
        {data.redo.length === 0 ? (
          <div className="empty">Queue is empty.</div>
        ) : (
          data.redo.map((r) => (
            <div key={r.id} className="redo-item">
              <button type="button" style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => setSheet(r)}>
                <div className="cell-main">{r.title}</div>
                <div className="cell-sub num">
                  {fmtDay(r.date)}
                  {r.result && `, ${r.result}`}
                </div>
                {r.notes && <div className="cell-sub">{firstLine(r.notes)}</div>}
              </button>
              {r.difficulty && <Tag>{cap(r.difficulty)}</Tag>}
              <button type="button" className="btn btn-sm" onClick={() => run(leetcodeApi.setRedo(r.id, false))}>
                Clear
              </button>
            </div>
          ))
        )}
      </div>

      <SectionTitle>Breakdown</SectionTitle>
      <Segmented
        options={[
          { value: "week", label: "This week" },
          { value: "all", label: "All time" },
        ]}
        value={range}
        onChange={setRange}
      />
      <div className="card pad" style={{ display: "grid", gap: "var(--s-3)" }}>
        <div className="muted num" style={{ fontSize: "var(--t-sm)" }}>
          {one(counts, "attempts")} attempts · {one(counts, "problems")} problems · {one(counts, "days")} days
        </div>
        <CountLine label="Difficulty" counts={counts.difficulty} order={[...DIFFICULTIES, "unknown"]} />
        <CountLine label="Result" counts={counts.result} order={[...RESULTS, "unstated"]} />
        <CountLine label="Topic" counts={counts.topic} />
      </div>

      <SectionTitle
        right={
          <span className="legend">
            <span className="inf" style={{ margin: 0 }}>
              inf
            </span>
            not from catalog
          </span>
        }
      >
        Log
      </SectionTitle>
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        {(
          [
            ["difficulty", "All levels", DIFFICULTIES],
            ["result", "All results", [...RESULTS, "unstated"]],
            ["topic", "All topics", topics],
          ] as const
        ).map(([key, all, options]) => (
          <select
            key={key}
            className="input"
            aria-label={`Filter by ${key}`}
            value={filter[key]}
            onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
            style={{ flex: 1, minWidth: 0 }}
          >
            <option value="">{all}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {cap(o)}
              </option>
            ))}
          </select>
        ))}
      </div>
      <DataTable
        rows={shown}
        empty={log.length ? "No attempts match these filters." : "Nothing logged yet."}
        onAdd={() => setSheet("new")}
        onRowClick={(r) => setSheet(r)}
        onDelete={(r) => run(leetcodeApi.remove(r.id))}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          {
            key: "title", label: "Problem", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">{r.title}</div>
                {r.notes && <div className="cell-sub">{firstLine(r.notes)}</div>}
              </>
            ),
          },
          {
            key: "difficulty", label: "Level", width: "auto",
            render: (r) =>
              r.difficulty ? (
                <>
                  <Tag>{cap(r.difficulty)}</Tag>
                  {r.inferred && <span className="inf">inf</span>}
                </>
              ) : (
                <span className="faint">–</span>
              ),
          },
          {
            key: "result", label: "Result", width: "auto",
            render: (r) => (r.result ? <Tag tone={r.result === "optimal" ? "" : "tag-outline"}>{cap(r.result)}</Tag> : <span className="faint">–</span>),
          },
          { key: "minutes", label: "Min", width: "auto", align: "right", render: (r) => <span className="muted num">{fmtMin(r.minutes)}</span> },
        ]}
      />

      <Fab onClick={() => setSheet("new")} />

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add problem" : "Edit problem"}
          fields={fields(sheet === "new" ? undefined : sheet)}
          confirm={sheet !== "new"}
          validate={validate}
          initial={sheet === "new" ? { date: logicalToday(), redo: false } : sheet}
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(leetcodeApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            if (sheet === "new") run(leetcodeApi.log(inputOf(v)));
            else run(leetcodeApi.update(sheet.id, inputOf(v)));
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}
