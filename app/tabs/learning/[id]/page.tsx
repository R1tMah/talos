"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { IconCheck, IconChevron } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { dayLabel, learningApi, timelineLabel, useCurriculums } from "@/lib/learning/data";
import { cadenceLabel } from "@/lib/learning/schedule";

/** One curriculum: its goal, schedule and every module, with replaced ones folded away. */
export default function CurriculumPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { rows, failed, reload } = useCurriculums();
  const [confirming, setConfirming] = useState(false);
  const c = rows?.find((r) => r.id === id);

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Learning" back="/tabs/learning" />
        <p role="alert" className="muted">Failed. <button type="button" className="btn btn-sm" onClick={reload}>Retry</button></p>
      </main>
    ) : <PageSkeleton />;
  }
  if (!c) {
    return (
      <main className="screen">
        <ScreenHeader title="Learning" back="/tabs/learning" />
        <p className="muted">This curriculum was removed.</p>
      </main>
    );
  }

  return (
    <main className="screen">
      <ScreenHeader title={c.title ?? c.topic} back="/tabs/learning" />
      <section className="card pad about-section">
        {c.goal && <p>{c.goal}</p>}
        <p className="faint">{cadenceLabel(c.cadence)} · {c.done}/{c.modules.length} done{c.status === "generating" ? " · Designing…" : ""}</p>
        {timelineLabel(c) && <p className={c.late != null && c.late > 0 ? "learn-late" : "faint"}>{timelineLabel(c)}</p>}
        {c.late != null && c.late > 0 && c.status === "active" && (
          <p className="faint">Missed days and recalibrating push the end out. Recalibrating on a module also re-fits the rest to your finish date.</p>
        )}
      </section>

      <div className="card list">
        {c.modules.map((m, i) => (
          <Link key={m.id} href={`/tabs/learning/lesson/${m.id}`} className="row learn-module-row">
            <span className={`learn-num${m.completedAt ? " done" : ""}`}>{m.completedAt ? <IconCheck size={14} /> : i + 1}</span>
            <span className="row-label">
              {m.title}
              <span className="cell-sub">{m.completedAt ? "Done" : m.date ? dayLabel(m.date) : ""}</span>
            </span>
            <IconChevron />
          </Link>
        ))}
      </div>

      {c.replaced.length > 0 && (
        <details className="card archived-acc">
          <summary>
            <span className="label">Replaced by Recalibrate ({c.replaced.length})</span>
            <IconChevron />
          </summary>
          {c.replaced.map((m) => (
            <Link key={m.id} href={`/tabs/learning/lesson/${m.id}`} className="row">
              <span className="row-label faint">{m.title}</span>
              <IconChevron />
            </Link>
          ))}
        </details>
      )}

      {confirming ? (
        <div className="card pad learn-actions">
          <span className="muted" style={{ fontSize: "var(--t-sm)" }}>Remove this curriculum from Learning?</span>
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" className="btn btn-sm btn-danger"
            onClick={async () => ((await learningApi.remove(c.id)) ? router.push("/tabs/learning") : setConfirming(false))}>
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm learn-remove" onClick={() => setConfirming(true)}>Remove curriculum</button>
      )}
    </main>
  );
}
