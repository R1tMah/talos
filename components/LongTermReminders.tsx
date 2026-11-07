"use client";

import { useState } from "react";
import { fmtOpenFor, logicalToday } from "@/lib/date";
import { generalRemindersApi, useLongTermReminders, type LongTermReminder } from "@/lib/generalReminders";
import { showToast } from "@/lib/undo";
import { IconCheck, IconPlus, IconX } from "./Icons";
import { ReminderSheet, dueText } from "./Reminders";
import { PageSkeleton } from "./Skeleton";
import { ScreenHeader, Tag } from "./ui";

/** "Mar 3" this year, "Mar 3, 2028" otherwise: long-term reminders can be years out. */
const fmtFar = (d: string, today: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });

/**
 * Long-Term Reminders: things to remember months out. Each one waits here, off the TALOS
 * banner, until the "show from" day the owner picked; from then on it's on the banner too.
 * Check = done, X = dismiss, tap = edit, same as the banner.
 */
export function LongTermRemindersScreen() {
  const { rows, failed, reload } = useLongTermReminders();
  const [sheet, setSheet] = useState<LongTermReminder | "new" | null>(null);
  const today = logicalToday();

  const report = (r: { status: string }) => r.status !== "saved" && showToast({ text: "Failed", tone: "error" });

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Long-Term Reminders" back="/tabs" />
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

  const now = rows.filter((r) => r.surfaced);
  const later = rows.filter((r) => !r.surfaced);

  const list = (label: string, rs: LongTermReminder[], empty: string) => (
    <section className="card reminders" aria-label={label}>
      <div className="reminders-head">
        <span className="label">{label}</span>
      </div>
      {rs.length === 0 ? (
        <p className="faint" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
          {empty}
        </p>
      ) : (
        rs.map((r) => (
          <div key={r.id} className="reminder-row">
            <button type="button" className="reminder-text" style={{ textAlign: "left" }} onClick={() => setSheet(r)}>
              <span className="cell-main" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {r.body}
              </span>
              <span className="reminder-meta">
                <Tag tone="tag-outline">{r.surfaced ? fmtOpenFor(r.created) : `Shows ${fmtFar(r.surface, today)}`}</Tag>
                {r.due && (
                  <span className="cell-sub num" style={r.due < today ? { color: "var(--danger)" } : undefined}>
                    {r.due < today || r.due === today ? dueText(r.due, today) : `Due ${fmtFar(r.due, today)}`}
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
  );

  return (
    <main className="screen">
      <ScreenHeader
        title="Long-Term Reminders"
        back="/tabs"
        right={
          <button type="button" className="btn btn-sm" onClick={() => setSheet("new")}>
            <IconPlus size={14} /> Add
          </button>
        }
      />
      {now.length > 0 && list("On TALOS now", now, "")}
      {list("Coming up", later, rows.length ? "Everything here is on TALOS now." : "Nothing long-term yet. Add one and pick the day it should show up on TALOS, or tell chat “add a long term reminder to…”.")}

      {sheet && <ReminderSheet reminder={sheet === "new" ? null : sheet} longTerm onClose={() => setSheet(null)} />}
    </main>
  );
}
