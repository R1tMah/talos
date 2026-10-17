"use client";

import { useMemo, useState } from "react";
import { ChangeList } from "@/components/ChangeList";
import { DataTable, type DividerRow } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, Sheet, type Field } from "@/components/FormSheet";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Segmented, Tag } from "@/components/ui";
import { IconPlus } from "@/components/Icons";
import { WeightChart } from "@/components/WeightChart";
import { WeightLog } from "@/components/WeightLog";
import { breakEnd, fmtRange, overlaps } from "@/lib/breaks";
import { addDays, fmtDay, fmtDow, logicalToday, weekStart } from "@/lib/date";
import type { TabExport } from "@/lib/exportTab";
import type { Break, WeightEntry } from "@/lib/types";
import { notesApi } from "@/lib/notesData";
import { useWeightData, weightApi, type WriteResult } from "@/lib/weightData";
import { buildWeightLog, weightLogRows, weightLogText, type LogItem, type WeightNote } from "@/lib/weightLog";

const FIELDS: Field[] = [
  { name: "lb", label: "Weight (lb)", type: "number", full: true },
  { name: "date", label: "Date", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional", trim: false },
];

const BREAK_FIELDS: Field[] = [
  { name: "start", label: "Start", type: "date" },
  { name: "end", label: "End (optional)", type: "date" },
  { name: "label", label: "Label", full: true, trim: false, placeholder: "Trip, week at home" },
];

function validateBreak(v: Record<string, unknown>) {
  if (!v.start) return "Start date is required.";
  if (!String(v.label ?? "").trim()) return "Label is required.";
  if (v.end && String(v.end) < String(v.start)) return "End date is before start date.";
  return null;
}

/** Break tag for a week row: the label exactly as typed, truncated only visually. */
function BreakTag({ b }: { b: Break }) {
  return (
    <span className="tag tag-break" title={`${b.label} · ${fmtRange(b)}`}>
      {b.label}
    </span>
  );
}

/** A save that hit an existing weight on the same day. */
interface Conflict {
  existing: WeightEntry;
  lb: number;
  note?: string;
}

/** The log as a spreadsheet, oldest first: every weigh-in with its week, plus trips and notes. */
function exportOf(log: LogItem[]): TabExport {
  return {
    title: "Weight",
    columns: [
      { key: "week", label: "Week" }, { key: "date", label: "Date" }, { key: "lb", label: "lb" },
      { key: "week_avg", label: "Week average" }, { key: "note", label: "Note" }, { key: "break", label: "Break" },
    ],
    rows: weightLogRows(log),
  };
}

export default function WeightPage() {
  const { data, failed, reload } = useWeightData();
  const [sheet, setSheet] = useState<WeightEntry | "new" | null>(null);
  const [view, setView] = useState<"log" | "weekly" | "daily">("log");
  const [noteSheet, setNoteSheet] = useState<WeightNote | "new" | null>(null);
  const [breakSheet, setBreakSheet] = useState<Break | "new" | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const weeks = useMemo(() => data?.weeks ?? [], [data]);
  const thisWeek = weekStart(logicalToday());
  const weekOf = (w: string) => weeks.find((r) => r.week === w);
  const cur = weekOf(thisWeek);
  const prev = weekOf(addDays(thisWeek, -7));
  const latest = entries[0];

  // Breaks are display-only: none of the numbers above use them.
  const breaks = useMemo(() => data?.breaks ?? [], [data]);
  const breaksIn = (week: string) => breaks.filter((b) => overlaps(b, week, addDays(week, 6)));

  // Daily list, newest first, with a divider at the top of each break's span.
  const daily = useMemo(() => {
    const items: { key: string; row: WeightEntry | DividerRow }[] = [
      ...entries.map((e) => ({ key: `${e.date}T${e.time}`, row: e })),
      ...breaks.map((b) => ({
        key: `${breakEnd(b)}T~`,
        row: {
          id: `break-${b.id}`,
          divider: true as const,
          label: `Break, ${fmtRange(b)}, ${b.label}`,
          onClick: () => setBreakSheet(b),
          content: (
            <>
              <span className="num">{fmtRange(b)}</span> · {b.label}
            </>
          ),
        },
      })),
    ];
    return items.sort((a, b) => b.key.localeCompare(a.key)).map((i) => i.row);
  }, [entries, breaks]);

  // The owner's own layout: numbered weeks, oldest first, with phases, trips and notes.
  const log = useMemo(
    () => (data ? buildWeightLog({ entries, weeks: weeks.map((w) => ({ week: w.week, avg: w.avg, days: w.days })), phases: data.phaseTexts, breaks, notes: data.notes }) : []),
    [data, entries, weeks, breaks],
  );

  /** Writes a weight note; any failure becomes the plain "Failed" message. */
  const runNote = async (write: Promise<{ status: string }>) => {
    setNotice(null);
    if ((await write).status !== "saved") setNotice("Failed");
    await reload();
  };

  /** Runs a write, reloads on success, and turns anything else into a plain message. */
  const run = async (write: Promise<WriteResult>, onConflict?: (existing: WeightEntry) => void) => {
    setNotice(null);
    const r = await write;
    if (r.status === "conflict" && onConflict) return onConflict(r.existing);
    if (r.status === "conflict") setNotice(`${fmtDay(r.existing.date)} already has a weight.`);
    else if (r.status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Weight" back="/tabs" />
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

  return (
    <main className="screen">
      <ScreenHeader title="Weight" back="/tabs" right={<ExportButton tab="weight" source={exportOf(log)} text={weightLogText(log)} order="oldest first, as in the log" />} />

      <SummaryStrip
        items={[
          { label: "Latest", value: latest ? latest.lb.toFixed(1) : "–", unit: "lb", sub: latest ? fmtDay(latest.date) : "" },
          { label: "This week", value: cur?.avg.toFixed(1) ?? "–", unit: "lb", sub: `${cur?.days ?? 0} of 7 days` },
          { label: "Last week", value: prev?.avg.toFixed(1) ?? "–", unit: "lb", sub: `${prev?.days ?? 0} of 7 days` },
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <WeightChart
        weeks={weeks}
        phases={data.phases}
        breaks={breaks}
        noteDays={entries.filter((e) => e.note).map((e) => e.date)}
      />

      <div className="break-bar">
        <span className="legend">
          <span className="break-swatch" /> Break
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setBreakSheet("new")}>
          <IconPlus size={14} /> Add break
        </button>
      </div>

      <Segmented
        options={[
          { value: "log", label: "Log" },
          { value: "weekly", label: "Weekly" },
          { value: "daily", label: "Daily" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "log" ? (
        <>
          <SectionTitle
            right={
              <button type="button" className="btn btn-sm" onClick={() => setNoteSheet("new")}>
                <IconPlus size={14} /> Add note
              </button>
            }
          >
            Oldest first
          </SectionTitle>
          <WeightLog items={log} onDay={(e) => setSheet(e)} onBreak={(b) => setBreakSheet(b)} onNote={(n) => setNoteSheet(n)} />
        </>
      ) : view === "weekly" ? (
        <DataTable
          rows={weeks}
          columns={[
            { key: "week", label: "Week of", width: "56px", render: (r) => fmtDay(r.week) },
            { key: "avg", label: "Avg", width: "52px", align: "right", render: (r) => r.avg.toFixed(1) },
            { key: "days", label: "Days", width: "32px", align: "right", render: (r) => `${r.days}/7` },
            {
              key: "tag", label: "", width: "minmax(0, 1fr)",
              render: (r) => (
                <span className="week-tags">
                  {breaksIn(r.week).map((b) => (
                    <BreakTag key={b.id} b={b} />
                  ))}
                  {r.partial && <Tag tone="tag-outline">partial</Tag>}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <>
          <SectionTitle right={<span className="legend">Swipe left to delete</span>}>All entries</SectionTitle>
          <DataTable
            rows={daily}
            onAdd={() => setSheet("new")}
            onRowClick={(r) => setSheet(r)}
            onDelete={(r) => run(weightApi.remove(r.id))}
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
          initial={sheet === "new" ? { lb: latest?.lb.toFixed(1) ?? "", date: logicalToday() } : sheet}
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(weightApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            const lb = v.lb as number;
            const date = v.date as string;
            const note = (v.note as string) || undefined;
            if (sheet === "new") run(weightApi.save(date, lb, note), (existing) => setConflict({ existing, lb, note }));
            else run(weightApi.update(sheet.id, date, lb, note));
            setSheet(null);
          }}
        />
      )}

      {breakSheet && (
        <FormSheet
          title={breakSheet === "new" ? "Add break" : "Edit break"}
          fields={BREAK_FIELDS}
          confirm={breakSheet !== "new"}
          validate={validateBreak}
          initial={breakSheet === "new" ? { start: logicalToday(), end: "", label: "" } : breakSheet}
          onClose={() => setBreakSheet(null)}
          onDelete={breakSheet !== "new" ? () => (run(weightApi.removeBreak(breakSheet.id)), setBreakSheet(null)) : undefined}
          onSubmit={(v) => {
            const start = v.start as string;
            const end = (v.end as string) || null;
            const label = v.label as string;
            if (breakSheet === "new") run(weightApi.saveBreak(start, end, label));
            else run(weightApi.updateBreak(breakSheet.id, start, end, label));
            setBreakSheet(null);
          }}
        />
      )}

      {noteSheet && (
        <FormSheet
          title={noteSheet === "new" ? "Add note" : `Note, ${fmtDay(noteSheet.date)}`}
          fields={[
            ...(noteSheet === "new" ? [{ name: "date", label: "Date", type: "date" as const }] : []),
            { name: "body", label: "Note", type: "textarea", trim: false, placeholder: "In your own words" },
          ]}
          confirm={noteSheet !== "new"}
          validate={(v) => (!String(v.body ?? "").trim() ? "Write something first." : noteSheet === "new" && !v.date ? "Date is required." : null)}
          initial={noteSheet === "new" ? { date: logicalToday(), body: "" } : { body: noteSheet.body }}
          onClose={() => setNoteSheet(null)}
          onDelete={noteSheet !== "new" ? () => (runNote(notesApi.remove(noteSheet.id)), setNoteSheet(null)) : undefined}
          onSubmit={(v) => {
            // Saved exactly as typed.
            const body = v.body as string;
            if (noteSheet === "new") runNote(notesApi.add("weight", v.date as string, body));
            else runNote(notesApi.setBody(noteSheet.id, body));
            setNoteSheet(null);
          }}
        />
      )}

      {conflict && (
        <Sheet title={`Update ${fmtDay(conflict.existing.date)}?`} onClose={() => setConflict(null)}>
          <ChangeList
            changes={[
              { field: "Weight", from: conflict.existing.lb.toFixed(1), to: conflict.lb.toFixed(1) },
              ...(conflict.note !== undefined ? [{ field: "Note", from: conflict.existing.note ?? "", to: conflict.note }] : []),
            ]}
          />
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConflict(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const { existing, lb, note } = conflict;
                run(weightApi.update(existing.id, existing.date, lb, note ?? existing.note));
                setConflict(null);
              }}
            >
              Confirm
            </button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
