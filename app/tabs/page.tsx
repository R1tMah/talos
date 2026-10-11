"use client";

import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtNum, newestFirst } from "@/lib/date";
import { useHomeStats } from "@/lib/homeStats";
import { countBy, inWeek, live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

export default function TabsPage() {
  const { db } = useStore();
  // Weight and Nutrition come from Supabase; the other cards still read local data.
  const { data: stats, failed } = useHomeStats();
  const w = stats?.weight;
  const n = stats?.nutrition;
  const pending = failed ? "Failed" : "–";

  const lc = live(db.leetcode);
  const apps = countBy(live(db.applications), (a) => a.status);
  const cbs = countBy(live(db.callbacks), (c) => c.type);
  const workouts = live(db.workouts).sort(newestFirst);

  return (
    <main className="screen">
      <ScreenHeader title="Tabs" />
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
          value={inWeek(lc).length}
          unit="this wk"
          rows={[
            { label: "Redo queue", value: lc.filter((x) => x.redo).length },
            { label: "Total", value: lc.length },
          ]}
        />
        <StatCard
          title="Lifts"
          value={inWeek(workouts).length}
          unit="this wk"
          rows={[
            { label: "Last", value: workouts[0] ? workouts[0].plan : "–" },
            { label: "On", value: workouts[0] ? fmtDay(workouts[0].date) : "–" },
          ]}
        />
        <StatCard
          title="Applications"
          href="/tabs/applications"
          value={live(db.applications).length}
          unit="total"
          rows={db.settings.statuses.slice(0, 4).map((st) => ({ label: st, value: apps[st] ?? 0 }))}
        />
        <StatCard
          title="Callbacks"
          href="/tabs/callbacks"
          value={cbs.Interview ?? 0}
          unit="interviews"
          rows={[
            { label: "OAs", value: cbs.OA ?? 0 },
            { label: "Recruiter", value: cbs.Recruiter ?? 0 },
          ]}
        />
      </div>

      <div className="grid-2">
        <NoteCard title="Content" href="/tabs/content" notes={db.content} />
        <NoteCard title="Work Journal" href="/tabs/journal" notes={db.journal} />
        <NoteCard title="Unsorted notes" href="/tabs/notes" notes={db.notes} span />
      </div>
    </main>
  );
}

function NoteCard({ title, href, notes, span }: { title: string; href: string; notes: Note[]; span?: boolean }) {
  const rows = live(notes).sort(newestFirst);
  return (
    <StatCard
      compact
      span={span ? 2 : undefined}
      title={title}
      href={href}
      value={rows.length}
      unit={rows.length === 1 ? "entry" : "entries"}
      rows={[{ label: "Last", value: rows[0] ? fmtDay(rows[0].date) : "–" }]}
    />
  );
}
