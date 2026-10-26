"use client";

// Weight > Phases: the dated spans drawn as bands on the weight chart. Each can carry
// calorie/protein targets, which Nutrition uses for those dates, and the owner's own
// description (saved exactly as typed).

import { useState } from "react";
import { FormSheet, Sheet, type Field } from "./FormSheet";
import { IconChevron, IconPlus } from "./Icons";
import { logicalToday } from "@/lib/date";
import { weightApi, type PhaseInput, type PhaseResult, type PhaseRow } from "@/lib/weightData";

const FIELDS: Field[] = [
  { name: "name", label: "Name (chart label)", placeholder: "Cut, Bulk, Maintain", full: true },
  { name: "start", label: "Start", type: "date" },
  { name: "end", label: "End (blank = ongoing)", type: "date" },
  { name: "calories", label: "Calorie target", type: "number", optional: true },
  { name: "protein", label: "Protein target (g)", type: "number", optional: true },
  { name: "description", label: "Description", type: "textarea", trim: false, full: true, placeholder: "What this phase was: eating, training, activity" },
];

/** "Mar 23, 2026": phases span years. */
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const phaseRange = (p: Pick<PhaseRow, "start" | "end">) => `${fmt(p.start)} – ${p.end ? fmt(p.end) : "now"}`;
const phaseTitle = (p: PhaseRow) => p.name ?? (p.calories ? `${p.calories} cal` : "Phase");

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validate(v: Record<string, unknown>) {
  if (!v.start) return "Start date is required.";
  if (v.end && String(v.end) < String(v.start)) return "End date is before start date.";
  if (v.calories != null && v.calories !== "" && !(finite(v.calories) && v.calories >= 800 && v.calories <= 6000)) return "Calories must be 800-6000.";
  if (v.protein != null && v.protein !== "" && !(finite(v.protein) && v.protein >= 0 && v.protein <= 500)) return "Protein must be 0-500 g.";
  return null;
}

const toInput = (v: Record<string, unknown>): PhaseInput => ({
  start: String(v.start),
  end: v.end ? String(v.end) : null,
  name: String(v.name ?? "").trim() || null,
  calories: finite(v.calories) ? Math.round(v.calories) : null,
  protein: finite(v.protein) ? Math.round(v.protein) : null,
  description: String(v.description ?? "") || null,
});

export function PhasesSheet({ phases, onClose, onChanged }: { phases: PhaseRow[]; onClose: () => void; onChanged: () => void }) {
  const [edit, setEdit] = useState<PhaseRow | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const newestFirst = [...phases].sort((a, b) => b.start.localeCompare(a.start));
  const open = phases.find((p) => p.end == null);

  const report = (r: PhaseResult) => {
    if (r.status === "overlap") setNotice(`Overlaps “${phaseTitle(r.existing)}” (${phaseRange(r.existing)}). Change the dates, or edit that phase first.`);
    else if (r.status === "invalid") setNotice(r.detail);
    else if (r.status === "failed") setNotice("Failed.");
    else setNotice(null);
    onChanged();
  };

  if (edit) {
    return (
      <FormSheet
        title={edit === "new" ? "Add phase" : "Edit phase"}
        submitLabel={edit === "new" ? "Add" : "Save"}
        fields={FIELDS}
        confirm={edit !== "new"}
        validate={validate}
        initial={
          edit === "new"
            ? { name: "", start: logicalToday(), end: "", calories: "", protein: "", description: "" }
            : { name: edit.name ?? "", start: edit.start, end: edit.end ?? "", calories: edit.calories ?? "", protein: edit.protein ?? "", description: edit.description ?? "" }
        }
        onClose={() => setEdit(null)}
        onDelete={edit !== "new" ? async () => (setEdit(null), report(await weightApi.removePhase(edit.id))) : undefined}
        onSubmit={async (v) => {
          const e = edit;
          setEdit(null);
          report(e === "new" ? await weightApi.addPhase(toInput(v)) : await weightApi.updatePhase(e.id, toInput(v)));
        }}
      />
    );
  }

  return (
    <Sheet title="Phases" onClose={onClose}>
      <div className="cal-form">
        <p className="faint" style={{ margin: 0, fontSize: "var(--t-sm)" }}>
          Shown as bands on the weight chart. A phase&rsquo;s calorie and protein targets are what Nutrition uses on its dates.
          {open && ` Adding a phase that starts after ${fmt(open.start)} ends “${phaseTitle(open)}” the day before.`}
        </p>
        {notice && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>{notice}</p>}
        <div className="card list">
          {newestFirst.length === 0 && <div className="empty"><span>No phases yet.</span></div>}
          {newestFirst.map((p) => (
            <button key={p.id} type="button" className="row" onClick={() => setEdit(p)}>
              <span className="row-label">
                {phaseTitle(p)}
                <span className="cell-sub num" style={{ display: "block" }}>
                  {phaseRange(p)}
                  {(p.calories || p.protein) && ` · ${[p.calories && `${p.calories} cal`, p.protein && `${p.protein} g protein`].filter(Boolean).join(", ")}`}
                </span>
              </span>
              <IconChevron />
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEdit("new")}>
          <IconPlus size={14} /> Add phase
        </button>
      </div>
    </Sheet>
  );
}
