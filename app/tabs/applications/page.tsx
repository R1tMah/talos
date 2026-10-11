"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, type Field } from "@/components/FormSheet";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, StatusPill } from "@/components/ui";
import { fmtDay, newestFirst, nowHM, todayISO, uid } from "@/lib/date";
import { countBy, live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Application } from "@/lib/types";

export default function ApplicationsPage() {
  const { db, add, update, remove } = useStore();
  const [sheet, setSheet] = useState<Application | "new" | null>(null);

  const rows = useMemo(() => live(db.applications).sort(newestFirst), [db.applications]);
  const counts = countBy(rows, (a) => a.status);
  const statuses = db.settings.statuses;

  const fields: Field[] = [
    { name: "company", label: "Company" },
    { name: "role", label: "Role" },
    { name: "status", label: "Status", type: "select", options: statuses },
    { name: "source", label: "Source" },
    { name: "date", label: "Date", type: "date" },
    { name: "time", label: "Time", type: "time" },
    { name: "link", label: "Link", placeholder: "Optional" },
  ];

  return (
    <main className="screen">
      <ScreenHeader title="Applications" back="/tabs" right={<ExportButton tab="applications" />} />
      <SummaryStrip items={[{ label: "Total", value: rows.length }, ...statuses.map((s) => ({ label: s, value: counts[s] ?? 0 }))]} />
      <DataTable
        rows={rows}
        onAdd={() => setSheet("new")}
        onRowClick={(r) => setSheet(r)}
        onDelete={(r) => remove("applications", r.id)}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          {
            key: "company", label: "Company", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">{r.company}</div>
                <div className="cell-sub">{r.role}</div>
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
          initial={sheet === "new" ? { date: todayISO(), time: nowHM(), status: statuses[0] } : sheet}
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (remove("applications", sheet.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            const data = v as Omit<Application, "id">;
            if (sheet === "new") add("applications", { id: uid(), ...data });
            else update("applications", sheet.id, data);
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}
