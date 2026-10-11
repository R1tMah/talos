"use client";

import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { addDays, fmtDay, fmtNum, newestFirst, todayISO, weekStart } from "@/lib/date";
import { countBy, dayTotals, inWeek, live, weekSummary } from "@/lib/stats";
import { useStore } from "@/lib/store";

export default function HomePage() {
  const { db } = useStore();
  const today = todayISO();
  const thisWeek = weekStart(today);

  const weights = live(db.weight).sort(newestFirst);
  const cur = weekSummary(weights, thisWeek);
  const prev = weekSummary(weights, addDays(thisWeek, -7));

  const t = dayTotals(live(db.food), today);
  const s = db.settings;

  const lc = live(db.leetcode);
  const apps = countBy(live(db.applications), (a) => a.status);
  const cbs = countBy(live(db.callbacks), (c) => c.type);
  const workouts = live(db.workouts).sort(newestFirst);

  return (
    <main className="screen">
      <ScreenHeader title="Home" back="/tabs" />
      <div className="grid-2">
        <StatCard
          title="Weight"
          href="/tabs/weight"
          value={weights[0]?.lb.toFixed(1) ?? "–"}
          unit="lb"
          accent
          rows={[
            { label: `This wk, ${cur.days}d`, value: cur.avg?.toFixed(1) ?? "–" },
            { label: "Last wk", value: prev.avg?.toFixed(1) ?? "–" },
          ]}
        />
        <StatCard
          title="Nutrition"
          href="/tabs/nutrition"
          value={fmtNum(t.cal)}
          unit="kcal"
          rows={[
            { label: "Target", value: fmtNum(s.calories) },
            { label: "Protein", value: `${t.p} / ${s.protein} g` },
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
          href="/workout"
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
          rows={s.statuses.slice(0, 4).map((st) => ({ label: st, value: apps[st] ?? 0 }))}
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
    </main>
  );
}
