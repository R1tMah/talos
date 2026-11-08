"use client";

import type { ReactNode } from "react";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { fmtDay } from "@/lib/date";
import { useHomeStats } from "@/lib/homeStats";
import { lastAnswer, useMockHistory } from "@/lib/mock/data";
import { overall } from "@/lib/mock/score";
import { GROUPS } from "@/lib/tabGroups";
import type { TabKey } from "@/lib/tabs";

const hrefOf = (key: TabKey) => `/tabs/interviews?tab=${GROUPS.interviews.find((t) => t.key === key)!.tab}`;

/**
 * The Interviews hub, shown as the Interviews tab of Recruiting (`switcher` is that page's
 * Applications | Callbacks | Interviews control): one roomy card per kind of practice, each opening its own screen.
 * Archived ones drop off (they're still in the Archived list on TALOS).
 */
export function InterviewsHub({ switcher }: { switcher?: ReactNode }) {
  const { data: stats, failed } = useHomeStats();
  const mocks = useMockHistory();
  const archived = useArchivedTabs();
  const shown = (k: TabKey) => !archived?.has(k);
  const pending = failed ? "Failed" : "–";

  const lc = stats?.leetcode;
  const note = (k: "sysdesign" | "aiassisted") => stats?.notes[k];
  // The latest mock with at least one graded answer.
  const graded = (mocks.rows ?? []).map((s) => ({ s, avg: overall(s.questions.map(lastAnswer).filter((a) => a != null).map((a) => a!.final)) })).find((x) => x.avg != null);

  const cards = [
    shown("leetcode") && (
      <StatCard
        key="leetcode"
        title="LeetCode"
        href={hrefOf("leetcode")}
        value={lc ? lc.week : pending}
        unit={lc ? "this wk" : undefined}
        accent
        rows={[
          { label: "Days this wk", value: lc ? lc.days : "–" },
          { label: "Redo queue", value: lc ? lc.redo : "–" },
        ]}
      />
    ),
    shown("behavioral") && (
      <StatCard
        key="behavioral"
        title="Behavioral"
        href={hrefOf("behavioral")}
        value={mocks.rows ? (graded ? graded.avg! : "–") : mocks.failed ? "Failed" : "–"}
        unit={graded ? "/10 last" : undefined}
        rows={[
          { label: "Mocks", value: mocks.rows ? mocks.rows.length : "–" },
          { label: "Last", value: mocks.rows?.[0] ? fmtDay(mocks.rows[0].created.slice(0, 10)) : "–" },
        ]}
      />
    ),
    shown("sysdesign") && (
      <StatCard
        key="sysdesign"
        title="System Design"
        href={hrefOf("sysdesign")}
        value={note("sysdesign")?.n ?? pending}
        unit={note("sysdesign") ? (note("sysdesign")!.n === 1 ? "mock" : "mocks") : undefined}
        rows={[{ label: "Last", value: note("sysdesign")?.last ? fmtDay(note("sysdesign")!.last!) : "–" }]}
      />
    ),
    shown("aiassisted") && (
      <StatCard
        key="aiassisted"
        title="AI-Assisted"
        href={hrefOf("aiassisted")}
        value={note("aiassisted")?.n ?? pending}
        unit={note("aiassisted") ? (note("aiassisted")!.n === 1 ? "mock" : "mocks") : undefined}
        rows={[{ label: "Last", value: note("aiassisted")?.last ? fmtDay(note("aiassisted")!.last!) : "–" }]}
      />
    ),
  ].filter(Boolean);

  return (
    <main className="screen">
      <ScreenHeader title="Recruiting" back="/tabs" />
      {switcher}
      {cards.length ? (
        <div className="grid-2">{cards}</div>
      ) : (
        <p className="muted">Every Interviews tab is archived. Unarchive one from the Archived list on TALOS.</p>
      )}
    </main>
  );
}
