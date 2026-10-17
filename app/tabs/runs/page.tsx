"use client";

import { ArchiveButton, ArchivedBar } from "@/components/TabArchive";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, type Field } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle } from "@/components/ui";
import { addDays, fmtDay, fmtNum, logicalToday, weekStart } from "@/lib/date";
import type { TabExport } from "@/lib/exportTab";
import { fmtDuration, paceOf, parseDuration, runsApi, useRuns, type Run, type RunInput, type WriteResult } from "@/lib/runsData";

const FIELDS: Field[] = [
  { name: "miles", label: "Distance (mi)", type: "number" },
  { name: "time", label: "Time", placeholder: "27:30 or 1:02:05" },
  { name: "date", label: "Date", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional" },
];

const mi = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const pace = (sec: number) => `${fmtDuration(sec)}/mi`;

function validate(v: Record<string, unknown>) {
  const miles = v.miles as number;
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "Distance must be more than 0.";
  const secs = parseDuration(String(v.time ?? ""));
  if (!secs) return "Time must look like 27:30, 1:02:05 or 27 min.";
  if (!v.date) return "Date is required.";
  return null;
}

const toInput = (v: Record<string, unknown>): RunInput => ({
  date: v.date as string,
  miles: v.miles as number,
  seconds: parseDuration(String(v.time))!,
  note: String(v.note ?? "").trim() || null,
});

function exportOf(runs: Run[]): TabExport {
  return {
    title: "Runs",
    columns: [
      { key: "date", label: "Date" }, { key: "miles", label: "Miles" }, { key: "time", label: "Time" },
      { key: "pace", label: "Pace (/mi)" }, { key: "cal", label: "Calories (est.)" }, { key: "note", label: "Note" },
    ],
    rows: runs.map((r) => ({
      date: r.date, miles: mi(r.miles), time: fmtDuration(r.seconds), pace: fmtDuration(paceOf(r)),
      cal: r.calories == null ? "" : String(r.calories), note: r.note ?? "",
    })),
  };
}

export default function RunsPage() {
  const { data, failed, reload } = useRuns();
  const [sheet, setSheet] = useState<Run | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runs = useMemo(() => data ?? [], [data]);

  const run = async (write: Promise<WriteResult>) => {
    setNotice(null);
    const r = await write;
    if (r.status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Runs" back="/tabs" />
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

  const today = logicalToday();
  const ws = weekStart(today);
  const week = runs.filter((r) => r.date >= ws && r.date <= addDays(ws, 6));
  const weekMiles = week.reduce((a, r) => a + r.miles, 0);
  const totalMiles = runs.reduce((a, r) => a + r.miles, 0);
  const totalSecs = runs.reduce((a, r) => a + r.seconds, 0);

  return (
    <main className="screen">
      <ScreenHeader title="Runs" back="/tabs" right={<><ArchiveButton tab="runs" /><ExportButton tab="runs" source={exportOf(runs)} /></>} />
      <ArchivedBar tab="runs" />

      <SummaryStrip
        items={[
          { label: "This week", value: mi(Math.round(weekMiles * 100) / 100), unit: "mi", sub: `${week.length} ${week.length === 1 ? "run" : "runs"}` },
          { label: "Overall pace", value: totalMiles ? fmtDuration(totalSecs / totalMiles) : "–", unit: "/mi", sub: `${runs.length} runs` },
          { label: "Total", value: mi(Math.round(totalMiles * 100) / 100), unit: "mi" },
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <SectionTitle right={<span className="legend">Calories are estimates</span>}>Runs</SectionTitle>
      <DataTable
        rows={runs}
        empty="No runs logged."
        onAdd={() => setSheet("new")}
        onRowClick={(r) => setSheet(r)}
        onDelete={(r) => run(runsApi.remove(r.id))}
        columns={[
          { key: "date", label: "Date", width: "50px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          {
            key: "dist", label: "Run", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">
                  {mi(r.miles)} mi · {fmtDuration(r.seconds)}
                </div>
                {r.note && <div className="cell-sub">{r.note}</div>}
              </>
            ),
          },
          { key: "pace", label: "Pace", width: "auto", align: "right", render: (r) => pace(paceOf(r)) },
          {
            key: "cal", label: "Cal", width: "44px", align: "right",
            render: (r) => <span className="muted">{r.calories == null ? "–" : `~${fmtNum(r.calories)}`}</span>,
          },
        ]}
      />

      <Fab onClick={() => setSheet("new")} label="Add run" />

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add run" : "Edit run"}
          fields={FIELDS}
          confirm={sheet !== "new"}
          validate={validate}
          initial={
            sheet === "new"
              ? { date: today, miles: "", time: "", note: "" }
              : { date: sheet.date, miles: sheet.miles, time: fmtDuration(sheet.seconds), note: sheet.note ?? "" }
          }
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(runsApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            run(sheet === "new" ? runsApi.log(toInput(v)) : runsApi.update(sheet.id, toInput(v)));
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}
