"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { IconChevron } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { Fab, ScreenHeader } from "@/components/ui";
import { DEFAULTS, KIND_LABELS, SourceForm } from "@/components/watch/SourceForm";
import { WatchCard } from "@/components/watch/Views";
import { useFreshCalendars, useWatchSources, watchApi } from "@/lib/watch/data";
import { blockAt, fmtHHMM, orderByTime } from "@/lib/watch/schedule";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { logicalToday } from "@/lib/date";
import { dueToday, useCurriculums } from "@/lib/learning/data";
import type { WatchKind } from "@/lib/watch/types";

/**
 * Watch: outside information, read-only. Each card shows what the last scheduled
 * fetch stored (trains are live); tap a card's name for the full view and its settings.
 */
export default function WatchPage() {
  const { data, failed, reload } = useWatchSources();
  useFreshCalendars(data, reload);
  const learning = useCurriculums();
  const archived = useArchivedTabs();
  const router = useRouter();
  const [adding, setAdding] = useState<WatchKind | "pick" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Re-render each minute so the order switches when a block of the day starts.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Back from Google sign-in while adding a calendar (?add=calendar&google=…): reopen the form.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("google");
    if (!g) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (g === "connected") {
      if (q.get("add") === "calendar") setAdding("calendar");
    } else setNotice(g === "denied" ? "Google sign-in was cancelled." : "Google sign-in failed. Try again.");
  }, []);

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="WATCH" brand />
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

  // Ordered by the block of the day (lib/watch/schedule.ts), not the set position.
  const shown = orderByTime(data.filter((s) => s.enabled), now);
  // Today's Learning lessons go above everything; each one leaves once it's finished.
  const lessons = learning.rows && !archived?.has("learning") ? dueToday(learning.rows, logicalToday(now)) : [];
  const { block, until } = blockAt(now);
  const hidden = data.filter((s) => !s.enabled);
  const adder = adding && adding !== "pick" ? DEFAULTS[adding] : null;

  return (
    <main className="screen">
      <ScreenHeader title="WATCH" brand />
      <Fab onClick={() => setAdding("pick")} label="Add source" />
      <p className="faint watch-block">
        {block.name}
        {until && ` · until ${fmtHHMM(until)}`}
      </p>
      {notice && <p role="alert" className="watch-fallback">{notice}</p>}
      {lessons.map(({ curriculum, module }) => (
        <Link key={module.id} href={`/tabs/learning/lesson/${module.id}`} className="card pad learn-today">
          <div>
            <span className="label">Learning{module.date && module.date < logicalToday(now) ? " · catch up" : " · today"}</span>
            <div className="cell-main">{curriculum.title ?? curriculum.topic} · Module {curriculum.modules.indexOf(module) + 1}: {module.title}</div>
          </div>
          <IconChevron />
        </Link>
      ))}
      {shown.map((s) => <WatchCard key={s.id} s={s} onChanged={reload} />)}
      {!shown.length && <p className="muted">Nothing to watch. Add a source with +.</p>}

      {hidden.length > 0 && (
        <details className="card archived-acc">
          <summary>
            <span className="label">Hidden ({hidden.length})</span>
            <IconChevron />
          </summary>
          {hidden.map((s) => (
            <Link key={s.id} href={`/watch/${s.id}`} className="row">
              <span className="row-label">{s.title}</span>
              <IconChevron />
            </Link>
          ))}
        </details>
      )}

      {adding === "pick" && (
        <Sheet title="Add source" onClose={() => setAdding(null)}>
          <div className="card list">
            {(Object.keys(KIND_LABELS) as WatchKind[]).map((k) => (
              <button key={k} type="button" className="row" onClick={() => setAdding(k)}>
                <span className="row-label">{KIND_LABELS[k]}</span>
                <IconChevron />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {adding && adding !== "pick" && adder && (
        <SourceForm
          source={{ kind: adding, title: adder.title, config: adder.config as Record<string, unknown>, enabled: true, everyMinutes: adder.every }}
          onClose={() => setAdding(null)}
          onSubmit={async (v) => {
            const kind = adding;
            setAdding(null);
            const position = Math.max(0, ...data.map((s) => s.position)) + 1;
            const id = await watchApi.create(kind, v.title, v.config, v.everyMinutes, position);
            if (!id) return setNotice("Failed to add.");
            if (kind !== "transit") await watchApi.refresh(id);
            router.push(`/watch/${id}`);
          }}
        />
      )}
    </main>
  );
}
