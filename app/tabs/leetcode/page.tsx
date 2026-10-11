"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet, type Field } from "@/components/FormSheet";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Tag } from "@/components/ui";
import { fmtDay, newestFirst, nowHM, todayISO, uid } from "@/lib/date";
import { inWeek, live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { LeetEntry } from "@/lib/types";

const RESULT_TONE: Record<string, string> = { Solved: "", Hint: "tag-outline", Failed: "tag-outline" };

function fields(inferred: string[] = []): Field[] {
  const b = (k: string) => (inferred.includes(k) ? "inferred" : undefined);
  return [
    { name: "problem", label: "Problem" },
    { name: "difficulty", label: "Difficulty", type: "select", options: ["Easy", "Medium", "Hard"], badge: b("difficulty") },
    { name: "result", label: "Result", type: "select", options: ["Solved", "Hint", "Failed"], badge: b("result") },
    { name: "minutes", label: "Minutes", type: "number", badge: b("minutes") },
    { name: "date", label: "Date", type: "date" },
    { name: "time", label: "Time", type: "time" },
    { name: "redo", label: "In redo queue", type: "toggle" },
  ];
}

const Inf = ({ on }: { on?: boolean }) => (on ? <span className="inf">inf</span> : null);

export default function LeetCodePage() {
  const { db, add, update, remove } = useStore();
  const [sheet, setSheet] = useState<LeetEntry | "new" | null>(null);

  const log = useMemo(() => live(db.leetcode).sort(newestFirst), [db.leetcode]);
  const redo = log.filter((x) => x.redo);
  const week = inWeek(log);

  return (
    <main className="screen">
      <ScreenHeader title="LeetCode" back="/tabs" />

      <SummaryStrip
        items={[
          { label: "This week", value: week.length },
          { label: "Solved", value: week.filter((x) => x.result === "Solved").length, sub: "this week" },
          { label: "Redo queue", value: redo.length },
          { label: "Total", value: log.length },
        ]}
      />

      <SectionTitle>Redo queue</SectionTitle>
      <div className="card">
        {redo.length === 0 ? (
          <div className="empty">Queue is empty.</div>
        ) : (
          redo.map((r) => (
            <div key={r.id} className="redo-item">
              <button type="button" style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => setSheet(r)}>
                <div className="cell-main">{r.problem}</div>
                <div className="cell-sub num">
                  {fmtDay(r.date)}, {r.result}
                </div>
              </button>
              <Tag>{r.difficulty}</Tag>
              <button type="button" className="btn btn-sm" onClick={() => update("leetcode", r.id, { redo: false })}>
                Clear
              </button>
            </div>
          ))
        )}
      </div>

      <SectionTitle
        right={
          <span className="legend">
            <span className="inf" style={{ margin: 0 }}>
              inf
            </span>
            inferred field
          </span>
        }
      >
        Log
      </SectionTitle>
      <DataTable
        rows={log}
        onAdd={() => setSheet("new")}
        onRowClick={(r) => setSheet(r)}
        onDelete={(r) => remove("leetcode", r.id)}
        columns={[
          { key: "date", label: "Date", width: "46px", render: (r) => <span className="faint">{fmtDay(r.date)}</span> },
          { key: "problem", label: "Problem", width: "1fr", render: (r) => <div className="cell-main">{r.problem}</div> },
          {
            key: "difficulty", label: "Level", width: "auto",
            render: (r) => (
              <>
                <Tag>{r.difficulty}</Tag>
                <Inf on={r.inferred?.includes("difficulty")} />
              </>
            ),
          },
          {
            key: "result", label: "Result", width: "auto",
            render: (r) => (
              <>
                <Tag tone={RESULT_TONE[r.result]}>{r.result}</Tag>
                <Inf on={r.inferred?.includes("result")} />
              </>
            ),
          },
          {
            key: "minutes", label: "Min", width: "auto", align: "right",
            render: (r) => (
              <span className="muted">
                {r.minutes}
                <Inf on={r.inferred?.includes("minutes")} />
              </span>
            ),
          },
        ]}
      />

      <Fab onClick={() => setSheet("new")} />

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add problem" : "Edit problem"}
          fields={fields(sheet === "new" ? [] : sheet.inferred)}
          confirm={sheet !== "new"}
          initial={
            sheet === "new"
              ? { date: todayISO(), time: nowHM(), difficulty: "Medium", result: "Solved", minutes: 30, redo: false }
              : sheet
          }
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (remove("leetcode", sheet.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            const data = v as Omit<LeetEntry, "id">;
            if (sheet === "new") add("leetcode", { id: uid(), ...data });
            else {
              // A field the owner touched is no longer model-inferred.
              const inferred = sheet.inferred?.filter((k) => String(v[k]) === String(sheet[k as keyof LeetEntry]));
              update("leetcode", sheet.id, { ...data, inferred: inferred?.length ? inferred : undefined });
            }
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}
