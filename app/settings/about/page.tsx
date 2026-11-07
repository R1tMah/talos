"use client";

import { useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/ui";
import { aboutSections, aboutText, type AboutWatchTab } from "@/lib/about";
import { useArchivedTabs } from "@/lib/archivedTabs";
import type { WatchKind } from "@/lib/watch/types";
import { createClient } from "@/utils/supabase/client";

/** Settings > About: what Talos is and everything in it, built from lib/about.ts plus live data. */
export default function AboutPage() {
  const archived = useArchivedTabs();
  const [watch, setWatch] = useState<AboutWatchTab[] | null | undefined>(undefined);
  const [copied, setCopied] = useState<"" | "Copied" | "Failed">("");

  useEffect(() => {
    createClient().from("watch_sources").select("title, kind, enabled").order("position").order("created_at")
      .then(({ data, error }) => setWatch(error ? null : data.map((r) => ({ title: r.title, kind: r.kind as WatchKind, enabled: r.enabled }))));
  }, []);

  const loading = archived == null || watch === undefined;
  const sections = useMemo(() => aboutSections(archived ?? new Set(), watch ?? null), [archived, watch]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(aboutText(sections));
      setCopied("Copied");
    } catch {
      setCopied("Failed");
    }
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <main className="screen">
      <ScreenHeader
        title="About"
        back="/settings"
        stickyBack
        right={
          <button type="button" className="btn btn-sm" onClick={copy} disabled={loading}>
            {copied || "Copy"}
          </button>
        }
      />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        sections.map((s) => (
          <section key={s.title} className="card pad about-section">
            <span className="label">{s.title}</span>
            {s.title === "General" ? (
              s.lines[0].split("\n\n").map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <ul>
                {s.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  );
}
