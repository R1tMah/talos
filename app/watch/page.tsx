"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { IconChevron, IconPlus } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { DEFAULTS, KIND_LABELS, SourceForm } from "@/components/watch/SourceForm";
import { WatchCard } from "@/components/watch/Views";
import { useWatchSources, watchApi } from "@/lib/watch/data";
import type { WatchKind } from "@/lib/watch/types";

/**
 * Watch: outside information, read-only. Each card shows what the last scheduled
 * fetch stored (trains are live); tap a card's name for the full view and its settings.
 */
export default function WatchPage() {
  const { data, failed, reload } = useWatchSources();
  const router = useRouter();
  const [adding, setAdding] = useState<WatchKind | "pick" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Watch" />
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

  const shown = data.filter((s) => s.enabled);
  const hidden = data.filter((s) => !s.enabled);
  const adder = adding && adding !== "pick" ? DEFAULTS[adding] : null;

  return (
    <main className="screen">
      <ScreenHeader
        title="Watch"
        right={
          <button type="button" className="icon-btn" aria-label="Add source" onClick={() => setAdding("pick")}>
            <IconPlus />
          </button>
        }
      />
      {notice && <p role="alert" className="watch-fallback">{notice}</p>}
      {shown.map((s) => <WatchCard key={s.id} s={s} />)}
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
