"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconRefresh, IconSliders } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { CalendarCard } from "@/components/watch/Calendar";
import { JobsView } from "@/components/watch/Jobs";
import { NewsletterView } from "@/components/watch/Newsletter";
import { SourceForm } from "@/components/watch/SourceForm";
import { Fallback, Headlines, SourceFooter, TeamView, TransitCard, WeatherCard } from "@/components/watch/Views";
import { loadSource, watchApi, type WatchSource } from "@/lib/watch/data";
import type { NewsSnap } from "@/lib/watch/types";

/** One Watch source in full, with its settings and a refresh-now button. */
export default function WatchSourcePage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<WatchSource | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setS(await loadSource(id)), [id]);
  useEffect(() => {
    reload();
  }, [reload]);

  // Back from Google sign-in (?google=…): say how it went, reopen the settings to pick calendars.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("google");
    if (!g) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (g === "connected") setEditing(true);
    else setNotice(g === "denied" ? "Google sign-in was cancelled." : "Google sign-in failed. Try again.");
  }, []);

  if (s === undefined) return <PageSkeleton />;
  if (s === null) {
    return (
      <main className="screen">
        <ScreenHeader title="Watch" back="/watch" />
        <p className="muted">Not found.</p>
      </main>
    );
  }

  const refresh = async () => {
    setBusy(true);
    setNotice(null);
    const r = await watchApi.refresh(s.id);
    if (!r.ok) setNotice(`Couldn't refresh: ${r.error ?? "failed"}`);
    await reload();
    setBusy(false);
  };

  return (
    <main className="screen">
      <ScreenHeader
        title={s.title}
        back="/watch"
        right={
          <>
            {s.kind !== "transit" && (
              <button type="button" className="icon-btn" aria-label="Refresh now" disabled={busy} onClick={refresh}>
                <IconRefresh className={busy ? "spin" : undefined} />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setEditing(true)}>
              <IconSliders />
            </button>
          </>
        }
      />
      {notice && <p role="alert" className="watch-fallback">{notice}</p>}
      {!s.enabled && <p className="faint">Hidden from Watch. Turn on “Show on Watch” in settings to bring it back.</p>}

      {s.kind === "transit" && <TransitCard s={s} full />}
      {s.kind === "weather" && <WeatherCard s={s} full />}
      {s.kind === "calendar" && <CalendarCard s={s} full />}
      {s.kind === "espn_team" && (
        <>
          <Fallback s={s} />
          <TeamView s={s} />
        </>
      )}
      {(s.kind === "espn_news" || s.kind === "headlines") && (
        <>
          <Fallback s={s} />
          {s.data != null && (
            <section className="card watch-card">
              <Headlines items={(s.data as NewsSnap).items} />
            </section>
          )}
        </>
      )}
      {s.kind === "newsletter" && (
        <>
          <Fallback s={s} />
          <NewsletterView s={s} />
        </>
      )}
      {s.kind === "jobs" && (
        <>
          <Fallback s={s} />
          <JobsView s={s} />
        </>
      )}
      <SourceFooter s={s} />

      {editing && (
        <SourceForm
          source={s}
          onClose={() => setEditing(false)}
          onSubmit={async (v) => {
            setEditing(false);
            if (!(await watchApi.save(s.id, v))) return setNotice("Failed to save.");
            // New settings mean the stored snapshot is for the old ones: fetch again now.
            if (s.kind !== "transit" && JSON.stringify(v.config) !== JSON.stringify(s.config)) await refresh();
            else await reload();
          }}
        />
      )}
    </main>
  );
}
