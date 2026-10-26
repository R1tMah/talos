"use client";

import { useState } from "react";
import { fmtDay, fmtOpenFor, logicalToday } from "@/lib/date";
import { generalRemindersApi, useGeneralReminders, type GeneralReminder } from "@/lib/generalReminders";
import { showToast } from "@/lib/undo";
import { FormSheet } from "./FormSheet";
import { IconCheck, IconPlus, IconX } from "./Icons";
import { Tag } from "./ui";

/** "Due Oct 25", "Due today", "Overdue, Oct 20": the date only, no nudging. */
function dueText(due: string, today: string) {
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

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Reminder" : "Edit reminder"}
          submitLabel={sheet === "new" ? "Add" : "Save"}
          confirm={sheet !== "new"}
          fields={[
            { name: "body", label: "Remind me to", type: "textarea", trim: false, full: true },
            { name: "due", label: "Due (optional)", type: "date" },
          ]}
          validate={(v) => (!String(v.body ?? "").trim() ? "Write the reminder first." : null)}
          initial={sheet === "new" ? { body: "", due: "" } : { body: sheet.body, due: sheet.due ?? "" }}
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (generalRemindersApi.dismiss(sheet.id).then(report), setSheet(null)) : undefined}
          onSubmit={async (v) => {
            const s = sheet;
            setSheet(null);
            const body = v.body as string;
            const due = (v.due as string) || null;
            report(s === "new" ? await generalRemindersApi.add(body, due, today) : await generalRemindersApi.update(s.id, body, due));
          }}
        />
      )}
    </>
  );
}
