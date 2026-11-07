"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ApplyReminders } from "@/components/ApplyReminders";
import { Reminders } from "@/components/Reminders";
import { IconChevron } from "@/components/Icons";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtNum, toISO } from "@/lib/date";
import { BASE_STATUSES } from "@/lib/applicationsData";
import { FLAGS } from "@/lib/flags";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { useLongTermReminders } from "@/lib/generalReminders";
import { useHomeStats } from "@/lib/homeStats";
import { dueToday, useCurriculums } from "@/lib/learning/data";
import { GROUPS } from "@/lib/tabGroups";
import { ARCHIVABLE, ONCE_IN_A_WHILE, type TabKey } from "@/lib/tabs";
import { CLASSES, dayBounds } from "@/lib/chess";
import { useChess } from "@/lib/chessData";

/** The current season's name and how many seasons there are, for the Long Term card. */
/** How many future letters are sealed and when the next unlocks (dates only, never text). */
function useSealedSummary() {
  const [v, setV] = useState<{ sealed: number; next: string | null } | null>(null);
  useEffect(() => {
    createClient().from("future_letters").select("deliver_at").is("opened_at", null).order("deliver_at")
      .then(({ data }) => data && setV({ sealed: data.length, next: data[0]?.deliver_at ?? null }));
  }, []);
  return v;
}

function useSeasonSummary() {
  const [v, setV] = useState<{ current: string | null; count: number } | null>(null);
  useEffect(() => {
    createClient().from("seasons").select("name, position").is("deleted_at", null).order("position", { ascending: false })
      .then(({ data }) => data && setV({ current: data[0]?.name ?? null, count: data.length }));
  }, []);
  return v;
}

export default function TabsPage() {
  // Every card reads Supabase through one round of queries (lib/homeStats.ts).
  const { data: stats, failed } = useHomeStats();
  const w = stats?.weight;
  const n = stats?.nutrition;
  const lc = stats?.leetcode;
  const mocks = stats ? stats.notes.sysdesign.n : null;
  const aiMocks = stats ? stats.notes.aiassisted.n : null;
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
  const seasons = useSeasonSummary();
  const longTerm = useLongTermReminders();
  // The next long-term reminder still waiting to show up on TALOS.
  const nextUp = longTerm.rows?.find((r) => !r.surfaced);
  const shown = (k: TabKey) => !archived?.has(k);
  // Without LeetCode, the Interviews headline is the mock count of whichever mock tabs are shown.
  const mockTotal = mocks == null || aiMocks == null ? null : (shown("sysdesign") ? mocks : 0) + (shown("aiassisted") ? aiMocks : 0);
  // Talos Improvements lives in Settings, so it isn't listed here even when archived.
  const archivedTabs = ARCHIVABLE.filter((t) => archived?.has(t.key) && t.key !== "talos");
  // Content, Work and Personal share one Journals card; it hides when all three are archived.
  const journals = GROUPS.journals.filter((j) => shown(j.key));
  const journalCount = stats ? journals.reduce((a, j) => a + stats.notes[j.key].n, 0) : null;
  // Occasional tabs, folded away under "Once in a while": Long Term (unless archived), Long-Term Reminders and the sites.
  const occasional = (shown("longterm") ? 1 : 0) + 2 + ONCE_IN_A_WHILE.length;
  const letters = useSealedSummary();
  // Learning: lessons due today across curriculums, and the soonest one coming up.
  const learning = useCurriculums();
  const due = learning.rows ? dueToday(learning.rows) : [];
  // Chess: games played today (4 AM day) and the three ratings, live from chess.com.
  const chess = useChess();
  const chessDay = dayBounds();
  const chessToday = chess.data ? chess.data.games.filter((g) => g.end >= chessDay.start && g.end < chessDay.end).length : null;
  const nextLesson = learning.rows?.filter((r) => r.status === "active" && r.next?.date).sort((a, b) => a.next!.date!.localeCompare(b.next!.date!))[0];

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
        {/* LeetCode, System Design, AI-Assisted and Behavioral share one Interviews card; each part hides when its tab is archived. */}
        {(shown("leetcode") || shown("sysdesign") || shown("aiassisted") || shown("behavioral")) && (
        <StatCard
          title="Interviews"
          href={`/tabs/interviews?tab=${shown("leetcode") ? "leetcode" : shown("sysdesign") ? "system-design" : shown("aiassisted") ? "ai-assisted" : "behavioral"}`}
          value={shown("leetcode") ? (lc ? lc.week : pending) : (mockTotal ?? pending)}
          unit={shown("leetcode") ? (lc ? "LC this wk" : undefined) : mockTotal != null ? (mockTotal === 1 ? "mock" : "mocks") : undefined}
          rows={[
            ...(shown("leetcode") ? [{ label: "Days this wk", value: lc ? lc.days : "–" }, { label: "Redo queue", value: lc ? lc.redo : "–" }] : []),
            ...(shown("sysdesign") ? [{ label: "Sys design mocks", value: mocks ?? "–" }] : []),
            ...(shown("aiassisted") ? [{ label: "AI-assisted mocks", value: aiMocks ?? "–" }] : []),
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
        {/* Applications and Callbacks share one Recruiting card; each half hides when its tab is archived. */}
        {(shown("applications") || shown("callbacks")) && (
        <StatCard
          title="Recruiting"
          href={`/tabs/recruiting?tab=${shown("applications") ? "applications" : "callbacks"}`}
          value={shown("applications") ? (ap ? ap.total : pending) : cbs ? (cbs.Interview ?? 0) : pending}
          unit={shown("applications") ? (ap ? "applications" : undefined) : cbs ? "interviews" : undefined}
          rows={[
            ...(shown("applications") && shown("callbacks") ? [{ label: "Interviews", value: cbs ? (cbs.Interview ?? 0) : "–" }] : []),
            ...(shown("callbacks") ? [{ label: "OAs", value: cbs ? (cbs.OA ?? 0) : "–" }, { label: "Recruiter", value: cbs ? (cbs.Recruiter ?? 0) : "–" }] : []),
            ...(!shown("callbacks") ? apStatuses.map((st) => ({ label: st, value: ap!.byStatus[st] })) : []),
          ]}
        />
        )}
        {journals.length > 0 && (
        <StatCard
          title="Journals"
          href={`/tabs/journals?tab=${journals[0].tab}`}
          value={journalCount ?? pending}
          unit={journalCount != null ? (journalCount === 1 ? "entry" : "entries") : undefined}
          rows={journals.map((j) => ({ label: j.label, value: stats ? stats.notes[j.key].n : "–" }))}
        />
        )}
        {shown("learning") && (
        <StatCard
          title="Learning"
          href="/tabs/learning"
          value={learning.rows ? due.length : learning.failed ? "Failed" : "–"}
          unit={learning.rows ? (due.length === 1 ? "lesson today" : "lessons today") : undefined}
          rows={[
            { label: "Next", value: nextLesson ? nextLesson.next!.title : "–" },
            { label: "Active", value: learning.rows ? learning.rows.filter((r) => r.status === "active").length : "–" },
          ]}
        />
        )}
        <StatCard
          title="Chess"
          href="/tabs/chess"
          value={chessToday ?? (chess.failed ? "Failed" : "–")}
          unit={chessToday != null ? (chessToday === 1 ? "game today" : "games today") : undefined}
          rows={CLASSES.map((c) => ({ label: c.label, value: chess.data?.stats[c.key].rating ?? "–" }))}
        />
      </div>

      {/* Once in a while: occasional tabs, folded away below the daily ones. */}
      <details className="card archived-acc once-acc">
        <summary>
          <span className="label">Once in a while ({occasional})</span>
          <IconChevron />
        </summary>
        <div className="grid-2">
          {shown("longterm") && (
            <StatCard
              compact
              title="Long Term"
              href="/tabs/long-term"
              value={seasons ? seasons.count : pending}
              unit={seasons ? (seasons.count === 1 ? "season" : "seasons") : undefined}
              rows={[{ label: "Current", value: seasons?.current ?? "–" }]}
            />
          )}
          <StatCard
            compact
            title="Long-Term Reminders"
            href="/tabs/reminders"
            value={longTerm.rows ? longTerm.rows.length : longTerm.failed ? "Failed" : "–"}
            unit={longTerm.rows ? (longTerm.rows.length === 1 ? "reminder" : "reminders") : undefined}
            rows={[{ label: "Next shows", value: nextUp ? fmtDay(nextUp.surface) : "–" }]}
          />
          <StatCard
            compact
            title="Future Letters"
            href="/tabs/letters"
            value={letters ? letters.sealed : "–"}
            unit={letters ? "sealed" : undefined}
            rows={[{ label: "Next unlocks", value: letters?.next ? fmtDay(toISO(new Date(letters.next))) : "–" }]}
          />
          {ONCE_IN_A_WHILE.map((t) => (
            <StatCard key={t.key} compact title={t.label} href={t.href} value="Site" rows={[{ label: t.sub, value: "" }]} />
          ))}
        </div>
      </details>

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
