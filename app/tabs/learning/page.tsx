"use client";

import Link from "next/link";
import { useState } from "react";
import { FormSheet } from "@/components/FormSheet";
import { IconChevron } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { EmptyState, Fab, ScreenHeader, SectionTitle } from "@/components/ui";
import { logicalToday } from "@/lib/date";
import { dayLabel, learningApi, timelineLabel, useCurriculums, type CurriculumView } from "@/lib/learning/data";
import { cadenceLabel, parseCadence, parseTimeline, sessionsBetween } from "@/lib/learning/schedule";

const FIELDS = [
  { name: "topic", label: "Topic", full: true, placeholder: "Kafka and message queues" },
  { name: "context", label: "Where you're starting from", type: "textarea" as const, full: true, placeholder: "I know basic Node.js APIs but nothing about event-driven architecture" },
  { name: "cadence", label: "Cadence", full: true, placeholder: "Mondays, Wednesdays, and Fridays" },
  { name: "finish", label: "Finish by (optional)", full: true, placeholder: "6 weeks, or a date like Dec 20" },
];

function CurriculumRow({ c, onRetry, onRemove }: { c: CurriculumView; onRetry: (c: CurriculumView) => void; onRemove: (c: CurriculumView) => void }) {
  const name = c.title ?? c.topic;
  if (c.status === "generating") {
    return (
      <div className="card pad learn-row">
        <div className="cell-main">{name}</div>
        <div className="cell-sub learn-building">Designing your curriculum… this takes a minute or two. You can leave this page.</div>
      </div>
    );
  }
  if (c.status === "failed") {
    return (
      <div className="card pad learn-row">
        <div className="cell-main">{name}</div>
        <div className="cell-sub" style={{ color: "var(--danger)" }}>{c.error ?? "Building it failed."}</div>
        <div className="learn-actions">
          <button type="button" className="btn btn-sm" onClick={() => onRetry(c)}>Try again</button>
          <button type="button" className="btn btn-sm" onClick={() => onRemove(c)}>Remove</button>
        </div>
      </div>
    );
  }
  const total = c.modules.length;
  return (
    <Link href={`/tabs/learning/${c.id}`} className="card pad learn-row learn-link">
      <div className="learn-row-head">
        <span className="cell-main">{name}</span>
        <IconChevron />
      </div>
      <div className="learn-progress" aria-label={`${c.done} of ${total} modules done`}>
        <span style={{ width: `${total ? (c.done / total) * 100 : 0}%` }} />
      </div>
      <div className="cell-sub">
        {c.done}/{total} done · {cadenceLabel(c.cadence)}
        {c.next ? ` · Next: ${c.next.title}${c.next.date ? `, ${dayLabel(c.next.date)}` : ""}` : " · Finished"}
      </div>
      {timelineLabel(c) && <div className={`cell-sub${c.late != null && c.late > 0 ? " learn-late" : ""}`}>{timelineLabel(c)}</div>}
    </Link>
  );
}

/** Learning: active and past curriculums, and "New curriculum". */
export default function LearningPage() {
  const { rows, failed, reload } = useCurriculums();
  const [form, setForm] = useState<{ topic?: string; context?: string; cadence?: string; finish?: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Learning" back="/tabs" />
        <p role="alert" className="muted">
          Failed.{" "}
          <button type="button" className="btn btn-sm" onClick={reload}>Retry</button>
        </p>
      </main>
    ) : (
      <PageSkeleton />
    );
  }

  const active = rows.filter((r) => r.status !== "done");
  const past = rows.filter((r) => r.status === "done");

  const submit = async (v: Record<string, unknown>) => {
    const cadence = parseCadence(String(v.cadence ?? ""))!;
    const finish = String(v.finish ?? "").trim() ? parseTimeline(String(v.finish), logicalToday()) : null;
    setForm(null);
    setNotice(null);
    const res = await learningApi.create(String(v.topic).trim(), String(v.context ?? "").trim(), cadence, finish);
    if (!res.ok) setNotice({ text: res.error, ok: false });
    await reload();
  };

  const remove = async (c: CurriculumView) => {
    if (!(await learningApi.remove(c.id))) setNotice({ text: "Failed", ok: false });
    await reload();
  };

  return (
    <main className="screen">
      <ScreenHeader title="Learning" back="/tabs" />
      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice.text}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState text="No curriculums yet. Start one: pick a topic, say where you're starting from, and when you'll study." onAdd={() => setForm({})} />
      ) : (
        <>
          {active.map((c) => (
            <CurriculumRow key={c.id} c={c} onRemove={remove}
              onRetry={(x) => (remove(x), setForm({ topic: x.topic, context: x.context, cadence: cadenceLabel(x.cadence), finish: x.targetDate ?? "" }))} />
          ))}
          {past.length > 0 && (
            <>
              <SectionTitle>Finished</SectionTitle>
              {past.map((c) => <CurriculumRow key={c.id} c={c} onRetry={() => {}} onRemove={remove} />)}
            </>
          )}
        </>
      )}

      <Fab label="New curriculum" onClick={() => setForm({})} />

      {form && (
        <FormSheet
          title="New curriculum"
          fields={FIELDS}
          initial={form}
          submitLabel="Build it"
          validate={(v) => {
            if (!String(v.topic ?? "").trim()) return "Topic is required.";
            if (String(v.topic).trim().length > 200) return "Keep the topic under 200 characters.";
            if (String(v.context ?? "").length > 2000) return "Keep the context under 2,000 characters.";
            const cadence = parseCadence(String(v.cadence ?? ""));
            if (!cadence) return "Cadence needs days, like \"Mon, Wed, Fri\", \"weekdays\" or \"daily\".";
            if (String(v.finish ?? "").trim()) {
              const today = logicalToday();
              const finish = parseTimeline(String(v.finish), today);
              if (!finish) return "Finish by needs a length like \"6 weeks\" or a future date like \"Dec 20\".";
              if (!sessionsBetween(cadence, today, finish)) return "There are no study days between today and that finish date.";
            }
            return null;
          }}
          onClose={() => setForm(null)}
          onSubmit={submit}
        />
      )}
    </main>
  );
}
