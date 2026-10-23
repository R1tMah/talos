"use client";

import { ArchiveButton, ArchivedBar } from "@/components/TabArchive";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ApplyReminders } from "@/components/ApplyReminders";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, type Field } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, StatusPill } from "@/components/ui";
import {
  applicationsApi, BASE_STATUSES, useApplicationsData, type AppEntry, type AppInput, type WriteResult,
} from "@/lib/applicationsData";
import { fmtDay, logicalToday } from "@/lib/date";
import type { TabExport } from "@/lib/exportTab";
import { countBy } from "@/lib/stats";

function validate(v: Record<string, unknown>) {
  if (!String(v.company ?? "").trim()) return "Company is required.";
  if (!String(v.position ?? "").trim()) return "Position is required.";
  if (!v.date) return "Date is required.";
  return null;
}

const toInput = (v: Record<string, unknown>): AppInput => ({
  company: v.company as string,
  position: v.position as string,
  date: v.date as string,
  status: v.status as string,
  resume: (v.resume as string) || null,
});

function exportOf(rows: AppEntry[]): TabExport {
  return {
    title: "Applications",
    columns: [
      { key: "date", label: "Date" }, { key: "company", label: "Company" }, { key: "position", label: "Position" },
      { key: "status", label: "Status" }, { key: "resume", label: "Resume" },
    ],
    rows: rows.map((a) => ({ date: a.date, company: a.company, position: a.position, status: a.status, resume: a.resume ?? "" })),
  };
}

export default function ApplicationsPage() {
  const { data, failed, reload } = useApplicationsData();
  const [sheet, setSheet] = useState<AppEntry | "new" | null>(null);
  // Watch's job postings link here with ?add=1&company=…&position=… to open the form prefilled.
  const [prefill, setPrefill] = useState<{ company?: string; position?: string }>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("add") !== "1") return;
    setPrefill({ company: q.get("company") ?? undefined, position: q.get("position") ?? undefined });
    setSheet("new");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const counts = countBy(rows, (a) => a.status);
  // Base statuses first, then any other status already used, in first-seen order.
  const statuses = [...BASE_STATUSES, ...Object.keys(counts).filter((s) => !BASE_STATUSES.includes(s))];

  /** Runs a write, reloads, and turns anything but success into a plain message. */
  const run = async (write: Promise<WriteResult>) => {
    setNotice(null);
    const r = await write;
    if (r.status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Applications" back="/tabs" />
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

  const fields: Field[] = [
    { name: "company", label: "Company" },
    { name: "position", label: "Position" },
    { name: "status", label: "Status", type: "select", options: statuses },
    { name: "date", label: "Date", type: "date" },
    { name: "resume", label: "Resume", placeholder: "Optional" },
  ];

  return (
    <main className="screen">
      <ScreenHeader title="Applications" back="/tabs" right={<><ArchiveButton tab="applications" /><ExportButton tab="applications" source={exportOf(rows)} /></>} />
      <ArchivedBar tab="applications" />
      <ApplyReminders variant="list" />
      <SummaryStrip
        items={[
          { label: "Total", value: rows.length },
          ...statuses.filter((s) => BASE_STATUSES.includes(s) || counts[s]).map((s) => ({ label: s, value: counts[s] ?? 0 })),
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <DataTable
        rows={rows}
        empty="No applications."
        onAdd={() => setSheet("new")}
        onRowClick={(r) => setSheet(r)}
        onDelete={(r) => run(applicationsApi.remove(r.id))}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          {
            key: "company", label: "Company", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">{r.company}</div>
                <div className="cell-sub">{r.position}</div>
              </>
            ),
          },
          { key: "status", label: "Status", width: "auto", align: "right", render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
      <Fab onClick={() => setSheet("new")} />
      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add application" : "Edit application"}
          fields={fields}
          confirm={sheet !== "new"}
          validate={validate}
          initial={sheet === "new" ? { date: logicalToday(), status: BASE_STATUSES[0], resume: "", ...prefill } : { ...sheet, resume: sheet.resume ?? "" }}
          onClose={() => (setSheet(null), setPrefill({}))}
          onDelete={sheet !== "new" ? () => (run(applicationsApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            run(sheet === "new" ? applicationsApi.save(toInput(v)) : applicationsApi.update(sheet.id, toInput(v)));
            setSheet(null);
            setPrefill({});
          }}
        />
      )}
    </main>
  );
}
