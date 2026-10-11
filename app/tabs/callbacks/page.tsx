"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet } from "@/components/FormSheet";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, StatusPill } from "@/components/ui";
import { fmtDay, newestFirst, nowHM, todayISO, uid } from "@/lib/date";
import { countBy, live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Callback } from "@/lib/types";
import { CALLBACK_FIELDS } from "./fields";

export default function CallbacksPage() {
  const { db, add, remove } = useStore();
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => live(db.callbacks).sort(newestFirst), [db.callbacks]);
  const c = countBy(rows, (r) => r.type);

  return (
    <main className="screen">
      <ScreenHeader title="Callbacks" back="/tabs" />
      <SummaryStrip
        items={[
          { label: "Interviews", value: c.Interview ?? 0 },
          { label: "OAs", value: c.OA ?? 0 },
          { label: "Recruiter", value: c.Recruiter ?? 0 },
        ]}
      />
      <DataTable
        rows={rows}
        onAdd={() => setAdding(true)}
        onRowClick={(r) => router.push(`/tabs/callbacks/${r.id}`)}
        onDelete={(r) => remove("callbacks", r.id)}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          {
            key: "company", label: "Company", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">{r.company}</div>
                <div className="cell-sub">{r.debrief ? r.debrief.split("\n")[0] : "No debrief"}</div>
              </>
            ),
          },
          { key: "type", label: "Type", width: "auto", render: (r) => <span className="muted">{r.type}</span> },
          { key: "stage", label: "Stage", width: "auto", align: "right", render: (r) => <StatusPill status={r.stage} /> },
        ]}
      />
      <Fab onClick={() => setAdding(true)} />
      {adding && (
        <FormSheet
          title="Add callback"
          fields={CALLBACK_FIELDS}
          initial={{ date: todayISO(), time: nowHM(), type: "Interview", stage: "Scheduled" }}
          onClose={() => setAdding(false)}
          onSubmit={(v) => {
            add("callbacks", { id: uid(), debrief: "", ...(v as Omit<Callback, "id" | "debrief">) });
            setAdding(false);
          }}
        />
      )}
    </main>
  );
}
