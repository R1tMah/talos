"use client";

// The jobs tab: what's new first, then the rest of the open postings. Postings stay
// in New until the owner taps "Mark seen"; just opening the tab doesn't clear them.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/ui";
import { logicalToday } from "@/lib/date";
import { remindersApi, useReminders } from "@/lib/remindersData";
import { showToast } from "@/lib/undo";
import { companyKey, loadAppliedCompanies, loadJobs, newSince, watchApi, type JobItem, type WatchSource } from "@/lib/watch/data";
import { jobMatches } from "@/lib/watch/match";
import type { JobsConfig } from "@/lib/watch/types";
import { shortDate } from "./format";

const PAGE = 50;

const reminderKey = (company: string, position: string) => `${company.trim().toLowerCase()}|${position.trim().toLowerCase()}`;

export function JobsView({ s }: { s: WatchSource }) {
  // "New" is measured from the last time the owner tapped "Mark seen".
  const [since, setSince] = useState(() => newSince(s));
  const [items, setItems] = useState<JobItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const { rows: reminders } = useReminders();
  const reminded = useMemo(() => new Set((reminders ?? []).map((r) => reminderKey(r.company, r.position))), [reminders]);

  useEffect(() => {
    let live = true;
    Promise.all([loadJobs(s.id), loadAppliedCompanies()]).then(([jobs, companies]) => {
      if (!live) return;
      if (!jobs) return setFailed(true);
      setItems(jobs);
      setApplied(companies);
    });
    return () => {
      live = false;
    };
  }, [s.id]);

  const config = s.config as unknown as JobsConfig;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (j) => jobMatches(j, config) && (!q || `${j.company} ${j.title} ${j.locations.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [items, config, query]);

  if (failed) return <p role="alert" className="muted">Failed to load postings.</p>;
  if (!items) return <p className="faint">Loading…</p>;

  const cut = Date.parse(since);
  const fresh = visible.filter((j) => Date.parse(j.firstSeen) > cut);
  const earlier = visible.filter((j) => Date.parse(j.firstSeen) <= cut && !j.closedAt);

  return (
    <>
      <input className="input" type="search" placeholder="Filter by company, role or place" value={query} onChange={(e) => setQuery(e.target.value)} />
      <section className="card list">
        <div className="group-head label jobs-new-head">
          <span>New {s.seenAt ? `since ${shortDate(since)}` : "in the last 3 days"} ({fresh.length})</span>
          {fresh.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                const now = new Date().toISOString();
                await watchApi.markSeen(s.id);
                setSince(now);
              }}
            >
              Mark seen
            </button>
          )}
        </div>
        {fresh.length ? fresh.map((j) => <JobRow key={j.key} j={j} applied={applied.has(companyKey(j.company))} reminded={reminded.has(reminderKey(j.company, j.title))} />) : (
          <p className="muted watch-empty pad">Nothing new.</p>
        )}
      </section>
      {earlier.length > 0 && (
        <section className="card list">
          <div className="group-head label">Earlier ({earlier.length})</div>
          {earlier.slice(0, shown).map((j) => <JobRow key={j.key} j={j} applied={applied.has(companyKey(j.company))} reminded={reminded.has(reminderKey(j.company, j.title))} />)}
          {earlier.length > shown && (
            <button type="button" className="row" onClick={() => setShown(shown + PAGE)}>
              <span className="row-label muted">Show {Math.min(PAGE, earlier.length - shown)} more</span>
            </button>
          )}
        </section>
      )}
    </>
  );
}

function JobRow({ j, applied, reminded }: { j: JobItem; applied: boolean; reminded: boolean }) {
  const add = `/tabs/applications?${new URLSearchParams({ add: "1", company: j.company, position: j.title })}`;
  // Saves an "Apply to X" reminder; the save toast (with Undo) comes from remindersApi.
  const remind = async () => {
    const r = await remindersApi.add(j.company, j.title, logicalToday());
    if (r.status === "conflict") showToast({ text: `${j.company} ${j.title} is already on your list.`, tone: "error" });
    else if (r.status !== "saved") showToast({ text: "Failed", tone: "error" });
  };
  return (
    <div className={`job${j.closedAt ? " closed" : ""}`}>
      <a href={j.url} target="_blank" rel="noopener noreferrer" className="job-main">
        <span className="cell-main">
          {j.company} {applied && <Tag tone="tag-1">Applied</Tag>} {reminded && <Tag tone="tag-outline">To apply</Tag>} {j.closedAt && <Tag tone="tag-outline">Closed</Tag>}
        </span>
        <span className="cell-sub">{j.title}</span>
        <span className="cell-sub faint">
          {j.locations.slice(0, 3).join(" · ")}{j.locations.length > 3 ? ` +${j.locations.length - 3}` : ""} · posted {shortDate(j.posted)}
        </span>
      </a>
      {!j.closedAt && !reminded && (
        <button type="button" className="btn btn-sm" aria-label={`Remind me to apply to ${j.company}`} onClick={remind}>
          Remind
        </button>
      )}
      {!j.closedAt && (
        <Link href={add} className="btn btn-sm" aria-label={`Add ${j.company} to Applications`}>
          Add
        </Link>
      )}
    </div>
  );
}
