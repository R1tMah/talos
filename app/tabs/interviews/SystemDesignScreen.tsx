"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NotepadScreen } from "@/components/Notepad";
import { Tag } from "@/components/ui";
import { fmtDay, fmtDow, logicalToday } from "@/lib/date";
import { prepStatus } from "@/lib/watch/prep";
import { useCurriculum, usePrepDone, usePrepSource } from "@/lib/watch/prepData";

/** Today's prep session (or the next one) and progress, linking into the plan on Watch. */
function PrepStrip() {
  const src = usePrepSource();
  const c = useCurriculum();
  const { done } = usePrepDone(c?.curriculum_id);
  if (!src || !c) return null;
  const st = prepStatus(c.sessions, src.start, logicalToday(), done);
  const x = st?.today ?? st?.next;
  return (
    <section className="card prep-block">
      <div className="pstats-head">
        <Link href={`/watch/${src.id}`} className="label">System Design Prep</Link>
        {st && <span className="faint num">{st.done}/{c.sessions.length} done</span>}
      </div>
      {x && (
        <Link href={`/watch/${src.id}?session=${x.session}`} className="prep-line-main">
          <span className="prep-badges">
            <Tag tone={st?.today ? "tag-accent" : "tag-outline"}>{st?.today ? (x.kind === "mock" ? "Mock today" : "Today") : `Next · ${fmtDow(x.date)} ${fmtDay(x.date)}`}</Tag>
            {st && st.missed.length > 0 && <Tag tone="tag-outline">{st.missed.length} to catch up</Tag>}
          </span>
          <span className="prep-title">{x.session}. {x.title}</span>
        </Link>
      )}
    </section>
  );
}

/** The System Design tab of Interviews: mock summaries, with the prep plan's status on top. */
export function SystemDesignScreen({ switcher }: { switcher?: ReactNode }) {
  return (
    <NotepadScreen
      kind="sysdesign"
      title="Interviews"
      switcher={
        <>
          {switcher}
          <PrepStrip />
        </>
      }
    />
  );
}
