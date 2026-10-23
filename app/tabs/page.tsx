"use client";

import Link from "next/link";
import { ApplyReminders } from "@/components/ApplyReminders";
import { Reminders } from "@/components/Reminders";
import { IconChevron } from "@/components/Icons";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtNum } from "@/lib/date";
import { BASE_STATUSES } from "@/lib/applicationsData";
import { FLAGS } from "@/lib/flags";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { useHomeStats } from "@/lib/homeStats";
import { ARCHIVABLE, type TabKey } from "@/lib/tabs";

export default function TabsPage() {
  // Every card reads Supabase through one round of queries (lib/homeStats.ts).
  const { data: stats, failed } = useHomeStats();
  const w = stats?.weight;
  const n = stats?.nutrition;
  const lc = stats?.leetcode;
  const ap = stats?.applications;
  // Statuses actually in use, base order first, at most four rows on the card.
  const apStatuses = ap
    ? [...BASE_STATUSES, ...Object.keys(ap.byStatus).filter((s) => !BASE_STATUSES.includes(s))].filter((s) => ap.byStatus[s]).slice(0, 4)
    : [];
  const pending = failed ? "Failed" : "–";
  const cbs = stats?.callbacks;
  const lifts = stats?.lifts;
  const runs = stats?.runs;
  // Archived tabs drop off the grid and sit in the accordion at the bottom.
  const archived = useArchivedTabs();
  const shown = (k: TabKey) => !archived?.has(k);
  const archivedTabs = ARCHIVABLE.filter((t) => archived?.has(t.key));

  return (
    <main className="screen">
      <ScreenHeader title="TALOS" brand />
      <Reminders />
      {shown("applications") && <ApplyReminders variant="banner" />}
      <div className="grid-2">
        <StatCard
          title="Weight"
          href="/tabs/weight"
          value={w ? (w.latest?.toFixed(1) ?? "–") : pending}
          unit={w?.latest != null ? "lb" : undefined}
          accent
          rows={[
            { label: `This wk${w?.thisWeek ? `, ${w.thisWeek.n}d` : ""}`, value: w?.thisWeek?.avg.toFixed(1) ?? "–" },
            { label: "Last wk", value: w?.lastWeek?.avg.toFixed(1) ?? "–" },
          ]}
        />
        <StatCard
          title="Nutrition"
          href="/tabs/nutrition"
          value={n ? fmtNum(n.cal) : pending}
          unit={n ? "kcal" : undefined}
          rows={[
            { label: "Target", value: n ? fmtNum(n.calTarget) : "–" },
            { label: "Protein", value: n ? `${Number.isInteger(n.p) ? n.p : n.p.toFixed(1)} / ${n.pTarget} g` : "–" },
          ]}
        />
        {shown("leetcode") && (
        <StatCard
          title="LeetCode"
          href="/tabs/leetcode"
          value={lc ? lc.week : pending}
          unit={lc ? "this wk" : undefined}
          rows={[
            { label: "Days this wk", value: lc ? lc.days : "–" },
            { label: "Redo queue", value: lc ? lc.redo : "–" },
            { label: "Total", value: lc ? lc.total : "–" },
          ]}
        />
        )}
        {FLAGS.workout && (
        <StatCard
          title="Lifts"
          href="/tabs/lifts"
          value={lifts ? lifts.week : pending}
          unit={lifts ? "this wk" : undefined}
          rows={[
            { label: "Last", value: lifts?.last ? lifts.last.plan : "–" },
            { label: "On", value: lifts?.last ? fmtDay(lifts.last.date) : "–" },
          ]}
        />
        )}
        {shown("runs") && (
        <StatCard
          title="Runs"
          href="/tabs/runs"
          value={runs ? runs.miles : pending}
          unit={runs ? "mi this wk" : undefined}
          rows={[
            { label: "Runs this wk", value: runs ? runs.week : "–" },
            { label: "Last", value: runs?.last ? `${runs.last.miles} mi, ${fmtDay(runs.last.date)}` : "–" },
          ]}
        />
        )}
        {shown("applications") && (
        <StatCard
          title="Applications"
          href="/tabs/applications"
          value={ap ? ap.total : pending}
          unit={ap ? "total" : undefined}
          rows={apStatuses.map((st) => ({ label: st, value: ap!.byStatus[st] }))}
        />
        )}
        {shown("callbacks") && (
        <StatCard
          title="Callbacks"
          href="/tabs/callbacks"
          value={cbs ? (cbs.Interview ?? 0) : pending}
          unit={cbs ? "interviews" : undefined}
          rows={[
            { label: "OAs", value: cbs ? (cbs.OA ?? 0) : "–" },
            { label: "Recruiter", value: cbs ? (cbs.Recruiter ?? 0) : "–" },
          ]}
        />
        )}
      </div>

      {(shown("content") || shown("journal") || shown("personal") || shown("talos")) && (
        <div className="grid-2">
          {shown("content") && <NoteCard title="Content" href="/tabs/content" pad={stats?.notes.content} pending={pending} />}
          {shown("journal") && <NoteCard title="Work Journal" href="/tabs/journal" pad={stats?.notes.journal} pending={pending} />}
          {shown("personal") && <NoteCard title="Personal Journal" href="/tabs/personal" pad={stats?.notes.personal} pending={pending} />}
          {shown("talos") && <NoteCard title="Talos Improvements" href="/tabs/talos" pad={stats?.notes.talos} pending={pending} unit="open" />}
        </div>
      )}

      {archivedTabs.length > 0 && (
        <details className="card archived-acc">
          <summary>
            <span className="label">Archived ({archivedTabs.length})</span>
            <IconChevron />
          </summary>
          {archivedTabs.map((t) => (
            <Link key={t.key} href={t.href} className="row">
              <span className="row-label">{t.label}</span>
              <IconChevron />
            </Link>
          ))}
        </details>
      )}
    </main>
  );
}

function NoteCard({ title, href, pad, pending, unit }: { title: string; href: string; pad?: { n: number; last: string | null }; pending: string; unit?: string }) {
  return (
    <StatCard
      compact
      title={title}
      href={href}
      value={pad ? pad.n : pending}
      unit={pad ? (unit ?? (pad.n === 1 ? "entry" : "entries")) : undefined}
      rows={[{ label: "Last", value: pad?.last ? fmtDay(pad.last) : "–" }]}
    />
  );
}
