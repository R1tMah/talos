"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ApplyReminders } from "@/components/ApplyReminders";
import { Reminders } from "@/components/Reminders";
import { IconChevron } from "@/components/Icons";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { fmtDay, fmtNum, logicalToday, toISO, weekStart } from "@/lib/date";
import { BASE_STATUSES } from "@/lib/applicationsData";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { useLongTermReminders } from "@/lib/generalReminders";
import { useHomeStats } from "@/lib/homeStats";
import { pickRows } from "@/lib/homeCards";
import { useHomeCards } from "@/lib/homeCardsData";
import { useLiftsSummary } from "@/lib/liftoffData";
import { dueToday, useCurriculums } from "@/lib/learning/data";
import { useExperiences } from "@/lib/experiencesData";
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
  const ap = stats?.applications;
  // Statuses actually in use, base order first, at most four rows on the card.
  const apStatuses = ap
    ? [...BASE_STATUSES, ...Object.keys(ap.byStatus).filter((s) => !BASE_STATUSES.includes(s))].filter((s) => ap.byStatus[s]).slice(0, 4)
    : [];
  const pending = failed ? "Failed" : "–";
  const cbs = stats?.callbacks;
  const runs = stats?.runs;
  // Archived tabs drop off the grid and sit in the accordion at the bottom.
  const archived = useArchivedTabs();
  // Which rows each card shows (Settings > Home cards); defaults until it loads.
  const { config: cards } = useHomeCards();
  const liftoff = useLiftsSummary(weekStart(logicalToday()));
  const seasons = useSeasonSummary();
  const longTerm = useLongTermReminders();
  // The next long-term reminder still waiting to show up on TALOS.
  const nextUp = longTerm.rows?.find((r) => !r.surfaced);
  const shown = (k: TabKey) => !archived?.has(k);
  // Talos Improvements lives in Settings, so it isn't listed here even when archived.
  const archivedTabs = ARCHIVABLE.filter((t) => archived?.has(t.key) && t.key !== "talos");
  // Content, Work and Personal share one Journals card; it hides when all three are archived.
  const journals = GROUPS.journals.filter((j) => shown(j.key));
  const journalCount = stats ? journals.reduce((a, j) => a + stats.notes[j.key].n, 0) : null;
  // Occasional tabs, folded away under "Once in a while": Learning and Long Term (unless archived), Long-Term Reminders, Future Letters and the sites.
  const occasional = (shown("learning") ? 1 : 0) + (shown("longterm") ? 1 : 0) + 2 + ONCE_IN_A_WHILE.length;
  const letters = useSealedSummary();
  // Learning: lessons due today across curriculums, and the soonest one coming up.
  const learning = useCurriculums();
  const due = learning.rows ? dueToday(learning.rows) : [];
  // Recommendations: how many are still to try, and the most recent one done.
  const recs = useExperiences();
  const recPending = recs.rows ? recs.rows.filter((r) => r.status === "pending").length : 0;
  const recLatest = recs.rows?.find((r) => r.status === "completed");
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
          rows={pickRows("weight", cards, [
            { key: "thisWeek", label: `This wk${w?.thisWeek ? `, ${w.thisWeek.n}d` : ""}`, value: w?.thisWeek?.avg.toFixed(1) ?? "–" },
            { key: "lastWeek", label: "Last wk", value: w?.lastWeek?.avg.toFixed(1) ?? "–" },
          ])}
        />
        <StatCard
          title="Nutrition"
          href="/tabs/nutrition"
          value={n ? fmtNum(n.cal) : pending}
          unit={n ? "kcal" : undefined}
          rows={pickRows("nutrition", cards, [
            { key: "target", label: "Target", value: n ? fmtNum(n.calTarget) : "–" },
            { key: "protein", label: "Protein", value: n ? `${Number.isInteger(n.p) ? n.p : n.p.toFixed(1)} / ${n.pTarget} g` : "–" },
            // Lifts lives in Nutrition now (Nutrition | Lifts).
            { key: "lifts", label: "Workouts this wk", value: liftoff.data ? liftoff.data.week : "–" },
          ])}
        />
        {/* Interviews (LeetCode, System Design, AI-Assisted, Behavioral) live in Recruiting now, with no card of their own. */}
        {shown("runs") && (
        <StatCard
          title="Runs"
          href="/tabs/runs"
          value={runs ? runs.miles : pending}
          unit={runs ? "mi this wk" : undefined}
          rows={pickRows("runs", cards, [
            { key: "count", label: "Runs this wk", value: runs ? runs.week : "–" },
            { key: "last", label: "Last", value: runs?.last ? `${runs.last.miles} mi, ${fmtDay(runs.last.date)}` : "–" },
          ])}
        />
        )}
        {/* Applications and Callbacks share one Recruiting card; each half hides when its tab is archived. */}
        {(shown("applications") || shown("callbacks")) && (
        <StatCard
          title="Recruiting"
          href={`/tabs/recruiting?tab=${shown("applications") ? "applications" : "callbacks"}`}
          value={shown("applications") ? (ap ? ap.total : pending) : cbs ? (cbs.Interview ?? 0) : pending}
          unit={shown("applications") ? (ap ? "applications" : undefined) : cbs ? "interviews" : undefined}
          rows={pickRows("recruiting", cards, [
            ...(shown("applications") && shown("callbacks") ? [{ key: "interviews", label: "Interviews", value: cbs ? (cbs.Interview ?? 0) : "–" }] : []),
            ...(shown("callbacks") ? [{ key: "oas", label: "OAs", value: cbs ? (cbs.OA ?? 0) : "–" }, { key: "recruiter", label: "Recruiter", value: cbs ? (cbs.Recruiter ?? 0) : "–" }] : []),
            // Statuses: on when picked, and (on an untouched card) whenever Callbacks is archived, as before.
            ...(shown("applications") && ap ? apStatuses.map((st) => ({ key: "statuses", label: st, value: ap.byStatus[st], fallback: !shown("callbacks") })) : []),
          ])}
        />
        )}
        {journals.length > 0 && (
        <StatCard
          title="Journals"
          href={`/tabs/journals?tab=${journals[0].tab}`}
          value={journalCount ?? pending}
          unit={journalCount != null ? (journalCount === 1 ? "entry" : "entries") : undefined}
          rows={pickRows("journals", cards, journals.map((j) => ({ key: j.key, label: j.label, value: stats ? stats.notes[j.key].n : "–" })))}
        />
        )}
        {shown("experiences") && (
        <StatCard
          title="Recommendations"
          href="/tabs/experiences"
          value={recs.rows ? recPending : recs.failed ? "Failed" : "–"}
          unit={recs.rows ? "to try" : undefined}
          rows={pickRows("experiences", cards, [
            { key: "latest", label: "Latest", value: recLatest?.title ?? "–" },
            { key: "done", label: "Done", value: recs.rows ? recs.rows.length - recPending : "–" },
          ])}
        />
        )}
        <StatCard
          title="Chess"
          href="/tabs/chess"
          value={chessToday ?? (chess.failed ? "Failed" : "–")}
          unit={chessToday != null ? (chessToday === 1 ? "game today" : "games today") : undefined}
          rows={pickRows("chess", cards, CLASSES.map((c) => ({ key: c.key, label: c.label, value: chess.data?.stats[c.key].rating ?? "–" })))}
        />
      </div>

      {/* Once in a while: occasional tabs, folded away below the daily ones. */}
      <details className="card archived-acc once-acc">
        <summary>
          <span className="label">Once in a while ({occasional})</span>
          <IconChevron />
        </summary>
        <div className="grid-2">
          {/* Learning: moved here from the daily grid; lessons due today still show at the top of Watch. */}
          {shown("learning") && (
            <StatCard
              compact
              title="Learning"
              href="/tabs/learning"
              value={learning.rows ? due.length : learning.failed ? "Failed" : "–"}
              unit={learning.rows ? (due.length === 1 ? "lesson today" : "lessons today") : undefined}
              rows={pickRows("learning", cards, [
                { key: "next", label: "Next", value: nextLesson ? nextLesson.next!.title : "–" },
                { key: "active", label: "Active", value: learning.rows ? learning.rows.filter((r) => r.status === "active").length : "–" },
              ])}
            />
          )}
          {shown("longterm") && (
            <StatCard
              compact
              title="Long Term"
              href="/tabs/long-term"
              value={seasons ? seasons.count : pending}
              unit={seasons ? (seasons.count === 1 ? "season" : "seasons") : undefined}
              rows={pickRows("longterm", cards, [{ key: "current", label: "Current", value: seasons?.current ?? "–" }])}
            />
          )}
          <StatCard
            compact
            title="Long-Term Reminders"
            href="/tabs/reminders"
            value={longTerm.rows ? longTerm.rows.length : longTerm.failed ? "Failed" : "–"}
            unit={longTerm.rows ? (longTerm.rows.length === 1 ? "reminder" : "reminders") : undefined}
            rows={pickRows("reminders", cards, [{ key: "next", label: "Next shows", value: nextUp ? fmtDay(nextUp.surface) : "–" }])}
          />
          <StatCard
            compact
            title="Future Letters"
            href="/tabs/letters"
            value={letters ? letters.sealed : "–"}
            unit={letters ? "sealed" : undefined}
            rows={pickRows("letters", cards, [{ key: "next", label: "Next unlocks", value: letters?.next ? fmtDay(toISO(new Date(letters.next))) : "–" }])}
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
