"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, StatusPill } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import { callbacksApi, useCallbacks } from "@/lib/callbacksData";
import { CALLBACK_FIELDS, callbackOf, validateCallback } from "./fields";

export default function CallbacksPage() {
  const router = useRouter();
  const { data, failed, reload } = useCallbacks();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Callbacks" back="/tabs" />
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

  const { rows, counts } = data;
  const other = Object.entries(counts).filter(([k]) => k !== "Interview" && k !== "OA");

  return (
    <main className="screen">
      <ScreenHeader title="Callbacks" back="/tabs" right={<ExportButton tab="callbacks" />} />
      <SummaryStrip
        items={[
          { label: "Interviews", value: counts.Interview ?? 0 },
          { label: "OAs", value: counts.OA ?? 0 },
          ...other.map(([k, v]) => ({ label: k, value: v })),
        ]}
      />

      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice.text}
        </p>
      )}

      <DataTable
        rows={rows}
        empty="No callbacks yet."
        onAdd={() => setAdding(true)}
        onRowClick={(r) => router.push(`/tabs/callbacks/${r.id}`)}
        onDelete={async (r) => {
          const res = await callbacksApi.remove(r.id);
          setNotice(res.status === "saved" ? null : { text: "Failed", ok: false });
          reload();
        }}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{r.date ? fmtDay(r.date) : "–"}</span> },
          {
            key: "company", label: "Company", width: "1fr",
            render: (r) => (
              <>
                <div className="cell-main">{r.company}</div>
                <div className="cell-sub">{r.debrief ? r.debrief.split("\n").find((l) => l.trim()) : "No debrief"}</div>
              </>
            ),
          },
          {
            key: "kind", label: "Type", width: "auto",
            render: (r) => (
              <span className="muted">
                {r.kind}
                {r.score && <span className="num"> · {r.score}</span>}
              </span>
            ),
          },
          {
            key: "outcome", label: "Outcome", width: "auto", align: "right",
            render: (r) => (r.outcome ? <StatusPill status={r.outcome} /> : <span className="faint">–</span>),
          },
        ]}
      />
      <Fab onClick={() => setAdding(true)} />
      {adding && (
        <FormSheet
          title="Add callback"
          fields={CALLBACK_FIELDS}
          validate={validateCallback}
          initial={{ date: logicalToday(), kind: "Interview" }}
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            setAdding(false);
            const c = callbackOf(v);
            const res = await callbacksApi.log(c);
            if (res.status !== "saved") setNotice({ text: "Failed", ok: false });
            else if (res.hasApplication === false) setNotice({ text: `Saved. There's no application for ${c.company} yet.`, ok: true });
            else setNotice(null);
            reload();
          }}
        />
      )}
    </main>
  );
}
