"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet, type Field } from "@/components/FormSheet";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Segmented, Tag } from "@/components/ui";
import { WeightChart } from "@/components/WeightChart";
import { addDays, fmtDay, fmtDow, newestFirst, nowHM, todayISO, uid, weekStart } from "@/lib/date";
import { live, weekSummary, weeklyWeights } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { WeightEntry } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "lb", label: "Weight (lb)", type: "number", full: true },
  { name: "date", label: "Date", type: "date" },
  { name: "time", label: "Time", type: "time" },
  { name: "note", label: "Note", placeholder: "Optional" },
];

export default function WeightPage() {
  const { db, add, update, remove } = useStore();
  const [sheet, setSheet] = useState<WeightEntry | "new" | null>(null);
  const [view, setView] = useState<"weekly" | "daily">("weekly");

  const entries = useMemo(() => live(db.weight).sort(newestFirst), [db.weight]);
  const weeks = useMemo(() => weeklyWeights(entries), [entries]);
  const thisWeek = weekStart(todayISO());
  const cur = weekSummary(entries, thisWeek);
  const prev = weekSummary(entries, addDays(thisWeek, -7));
  const latest = entries[0];

  return (
    <main className="screen">
      <ScreenHeader title="Weight" back="/tabs" />

      <SummaryStrip
        items={[
          { label: "Latest", value: latest ? latest.lb.toFixed(1) : "–", unit: "lb", sub: latest ? fmtDay(latest.date) : "" },
          { label: "This week", value: cur.avg?.toFixed(1) ?? "–", unit: "lb", sub: `${cur.days} of 7 days` },
          { label: "Last week", value: prev.avg?.toFixed(1) ?? "–", unit: "lb", sub: `${prev.days} of 7 days` },
        ]}
      />

      <WeightChart weeks={weeks.slice(0, 12)} phases={db.phases} noteDays={entries.filter((e) => e.note).map((e) => e.date)} />

      <Segmented
        options={[
          { value: "weekly", label: "Weekly" },
          { value: "daily", label: "Daily" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "weekly" ? (
        <DataTable
          rows={weeks}
          columns={[
            { key: "week", label: "Week of", width: "1fr", render: (r) => fmtDay(r.week) },
            { key: "avg", label: "Average", width: "80px", align: "right", render: (r) => r.avg.toFixed(1) },
            { key: "days", label: "Days", width: "44px", align: "right", render: (r) => `${r.days}/7` },
            { key: "tag", label: "", width: "56px", align: "right", render: (r) => (r.partial ? <Tag tone="tag-outline">partial</Tag> : null) },
          ]}
        />
      ) : (
        <>
          <SectionTitle right={<span className="legend">Swipe left to delete</span>}>All entries</SectionTitle>
          <DataTable
            rows={entries}
            onAdd={() => setSheet("new")}
            onRowClick={(r) => setSheet(r)}
            onDelete={(r) => remove("weight", r.id)}
            columns={[
              {
                key: "date", label: "Date", width: "1fr",
                render: (r) => (
                  <>
                    <div className="cell-main">
                      {fmtDow(r.date)} {fmtDay(r.date)}
                    </div>
                    {r.note && <div className="cell-sub">{r.note}</div>}
                  </>
                ),
              },
              { key: "time", label: "Time", width: "52px", render: (r) => <span className="faint">{r.time}</span> },
              { key: "lb", label: "lb", width: "56px", align: "right", render: (r) => r.lb.toFixed(1) },
            ]}
          />
        </>
      )}

      <Fab onClick={() => setSheet("new")} label="Add weight" />

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add weight" : "Edit weight"}
          fields={FIELDS}
          confirm={sheet !== "new"}
          initial={sheet === "new" ? { lb: latest?.lb.toFixed(1) ?? "", date: todayISO(), time: nowHM() } : sheet}
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (remove("weight", sheet.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            const data = { lb: v.lb as number, date: v.date as string, time: v.time as string, note: (v.note as string) || undefined };
            if (sheet === "new") add("weight", { id: uid(), ...data });
            else update("weight", sheet.id, data);
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}
