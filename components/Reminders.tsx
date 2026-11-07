"use client";

import { useState } from "react";
import { fmtDay, fmtOpenFor, logicalToday } from "@/lib/date";
import { generalRemindersApi, useGeneralReminders, type GeneralReminder } from "@/lib/generalReminders";
import { showToast } from "@/lib/undo";
import { FormSheet } from "./FormSheet";
import { IconCheck, IconPlus, IconX } from "./Icons";
import { Tag } from "./ui";

/** "Due Oct 25", "Due today", "Overdue, Oct 20": the date only, no nudging. */
export function dueText(due: string, today: string) {
  if (due === today) return "Due today";
  return due < today ? `Overdue, ${fmtDay(due)}` : `Due ${fmtDay(due)}`;
}

/**
 * General reminders on the Tabs page, styled like the "To apply" card below it.
 * Check = done, X = dismiss, tap = edit. Text is saved exactly as typed.
 */
export function Reminders() {
  const { rows } = useGeneralReminders();
  const [sheet, setSheet] = useState<GeneralReminder | "new" | null>(null);
  const today = logicalToday();

  const report = (r: { status: string }) => r.status !== "saved" && showToast({ text: "Failed", tone: "error" });

  if (!rows) return null;

  return (
    <>
      <section className="card reminders banner" aria-label="Reminders">
        <div className="reminders-head">
          <span className="label">Reminders</span>
          <button type="button" className="btn btn-sm" onClick={() => setSheet("new")}>
            <IconPlus size={14} /> Add
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="faint" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
            Nothing to remember.
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="reminder-row">
              <button type="button" className="reminder-text" style={{ textAlign: "left" }} onClick={() => setSheet(r)}>
                <span className="cell-main" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {r.body}
                </span>
                <span className="reminder-meta">
                  <Tag tone="tag-outline">{fmtOpenFor(r.created)}</Tag>
                  {r.surface && <Tag tone="tag-outline">Long-term</Tag>}
                  {r.due && (
                    <span className="cell-sub num" style={r.due < today ? { color: "var(--danger)" } : undefined}>
                      {dueText(r.due, today)}
                    </span>
                  )}
                </span>
              </button>
              <button type="button" className="icon-btn" aria-label={`Dismiss: ${r.body}`} onClick={async () => report(await generalRemindersApi.dismiss(r.id))}>
                <IconX size={18} />
              </button>
              <button type="button" className="icon-btn reminder-check" aria-label={`Done: ${r.body}`} onClick={async () => report(await generalRemindersApi.complete(r.id))}>
                <IconCheck size={18} />
              </button>
            </div>
          ))
        )}
      </section>

      {sheet && <ReminderSheet reminder={sheet === "new" ? null : sheet} longTerm={sheet !== "new" && !!sheet.surface} onClose={() => setSheet(null)} />}
    </>
  );
}

/**
 * Add or edit one reminder. `longTerm` adds the required "Show on TALOS from" date: the
 * reminder stays on its own tab until then, then joins the banner. Editing keeps a
 * long-term reminder long-term.
 */
export function ReminderSheet({ reminder, longTerm, onClose }: { reminder: GeneralReminder | null; longTerm: boolean; onClose: () => void }) {
  const today = logicalToday();
  const report = (r: { status: string }) => r.status !== "saved" && showToast({ text: "Failed", tone: "error" });
  const isNew = !reminder;

  return (
    <FormSheet
      title={isNew ? (longTerm ? "Long-term reminder" : "Reminder") : longTerm ? "Edit long-term reminder" : "Edit reminder"}
      submitLabel={isNew ? "Add" : "Save"}
      confirm={!isNew}
      fields={[
        { name: "body", label: "Remind me to", type: "textarea", trim: false, full: true },
        ...(longTerm ? [{ name: "surface", label: "Show on TALOS from", type: "date" as const }] : []),
        { name: "due", label: "Due (optional)", type: "date" },
      ]}
      validate={(v) => {
        if (!String(v.body ?? "").trim()) return "Write the reminder first.";
        if (longTerm && !v.surface) return "Pick the day it should show up on TALOS.";
        if (longTerm && v.due && String(v.surface) > String(v.due)) return "It should show up on or before the due date.";
        return null;
      }}
      initial={{ body: reminder?.body ?? "", due: reminder?.due ?? "", ...(longTerm ? { surface: reminder?.surface ?? "" } : {}) }}
      onClose={onClose}
      onDelete={reminder ? () => (generalRemindersApi.dismiss(reminder.id).then(report), onClose()) : undefined}
      onSubmit={async (v) => {
        onClose();
        const body = v.body as string;
        const due = (v.due as string) || null;
        const surface = longTerm ? (v.surface as string) : null;
        report(reminder ? await generalRemindersApi.update(reminder.id, body, due, surface) : await generalRemindersApi.add(body, due, today, surface));
      }}
    />
  );
}
