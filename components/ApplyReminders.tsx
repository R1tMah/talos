"use client";

import { useState } from "react";
import { fmtOpenFor, logicalToday } from "@/lib/date";
import { remindersApi, useReminders, type Reminder } from "@/lib/remindersData";
import { showToast } from "@/lib/undo";
import { FormSheet } from "./FormSheet";
import { IconCheck, IconPlus, IconX } from "./Icons";
import { Tag } from "./ui";

/**
 * "Apply to X" reminders. `banner` is the compact strip on the Tabs page (hidden
 * when there are none); `list` is the section at the top of the Applications tab,
 * with an Add button. Check = record the application; X = dismiss.
 */
export function ApplyReminders({ variant }: { variant: "banner" | "list" }) {
  const { rows } = useReminders();
  const [applying, setApplying] = useState<Reminder | null>(null);
  const [adding, setAdding] = useState(false);

  const report = (r: { status: string }, conflict?: string) => {
    if (r.status === "conflict") showToast({ text: conflict ?? "Failed", tone: "error" });
    else if (r.status !== "saved") showToast({ text: "Failed", tone: "error" });
  };

  if (!rows) return null;
  if (variant === "banner" && rows.length === 0) return null;

  return (
    <>
      <section className={`card reminders ${variant}`} aria-label="Applications to send">
        <div className="reminders-head">
          <span className="label">To apply</span>
          {variant === "list" && (
            <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
              <IconPlus size={14} /> Add
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="faint" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
            Nothing to apply to.
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="reminder-row">
              <span className="reminder-text">
                <span className="cell-main">Apply to {r.company}</span>
                <span className="reminder-meta">
                  <Tag tone="tag-outline">{fmtOpenFor(r.created)}</Tag>
                  <span className="cell-sub">{r.position}</span>
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Dismiss ${r.company}`} onClick={async () => report(await remindersApi.dismiss(r.id))}>
                <IconX size={18} />
              </button>
              <button type="button" className="icon-btn reminder-check" aria-label={`Applied to ${r.company}`} onClick={() => setApplying(r)}>
                <IconCheck size={18} />
              </button>
            </div>
          ))
        )}
      </section>

      {applying && (
        <FormSheet
          title={`Applied to ${applying.company}`}
          submitLabel="Mark applied"
          fields={[
            { name: "date", label: "Date applied", type: "date" },
            { name: "resume", label: "Resume", placeholder: "Optional", full: true },
          ]}
          validate={(v) => (!v.date ? "Date is required." : null)}
          initial={{ date: logicalToday(), resume: "" }}
          onClose={() => setApplying(null)}
          onSubmit={async (v) => {
            const r = applying;
            setApplying(null);
            report(await remindersApi.apply(r.id, v.date as string, (v.resume as string) || null));
          }}
        />
      )}

      {adding && (
        <FormSheet
          title="Reminder to apply"
          submitLabel="Add"
          fields={[
            { name: "company", label: "Company", full: true },
            { name: "position", label: "Position", full: true },
          ]}
          validate={(v) =>
            !String(v.company ?? "").trim() ? "Company is required." : !String(v.position ?? "").trim() ? "Position is required." : null
          }
          initial={{ company: "", position: "" }}
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            setAdding(false);
            const company = String(v.company).trim();
            const position = String(v.position).trim();
            report(await remindersApi.add(company, position, logicalToday()), `${company} ${position} is already on your list.`);
          }}
        />
      )}
    </>
  );
}
