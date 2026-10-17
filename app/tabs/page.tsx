"use client";

import { ApplyReminders } from "@/components/ApplyReminders";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtNum } from "@/lib/date";
import { BASE_STATUSES } from "@/lib/applicationsData";
import { FLAGS } from "@/lib/flags";
import { useHomeStats } from "@/lib/homeStats";

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

  return (
    <main className="screen">
      <ScreenHeader title="Tabs" />
      <ApplyReminders variant="banner" />
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
        <StatCard
          title="Applications"
          href="/tabs/applications"
          value={ap ? ap.total : pending}
          unit={ap ? "total" : undefined}
          rows={apStatuses.map((st) => ({ label: st, value: ap!.byStatus[st] }))}
        />
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
      </div>

      <div className="grid-2">
        <NoteCard title="Content" href="/tabs/content" pad={stats?.notes.content} pending={pending} />
        <NoteCard title="Work Journal" href="/tabs/journal" pad={stats?.notes.journal} pending={pending} />
      </div>
    </main>
  );
}

function NoteCard({ title, href, pad, pending }: { title: string; href: string; pad?: { n: number; last: string | null }; pending: string }) {
  return (
    <StatCard
      compact
      title={title}
      href={href}
      value={pad ? pad.n : pending}
      unit={pad ? (pad.n === 1 ? "entry" : "entries") : undefined}
      rows={[{ label: "Last", value: pad?.last ? fmtDay(pad.last) : "–" }]}
    />
  );
}
