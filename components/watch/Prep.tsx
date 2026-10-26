"use client";

// System Design Prep on Watch: today's session (or the next one, plus any missed with a
// catch-up badge) on the card; the whole plan and each session in full on the source's
// page. The curriculum is static data, shown as written; answers hide until tapped.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Tag } from "@/components/ui";
import { fmtDay, fmtDow, logicalToday } from "@/lib/date";
import { mockPrompt, prepStatus, type Curriculum, type Dated, type PrepConfig, type QA, type Session } from "@/lib/watch/prep";
import { useCurriculum, usePrepDone } from "@/lib/watch/prepData";
import type { WatchSource } from "@/lib/watch/data";
import { IconCheck } from "@/components/Icons";
import { CardHead } from "./Views";

// The other half of interview prep: mock summaries (and LeetCode) on Tabs.
const INTERVIEWS = "/tabs/interviews?tab=system-design";

const startOf = (s: WatchSource) => (s.config as unknown as PrepConfig).start ?? "";
const when = (date: string) => `${fmtDow(date)} ${fmtDay(date)}`;
const kindLabel = (x: Session) => `${x.kind === "mock" ? "Mock" : "Learn"} · ${x.minutes} min`;

function DoneButton({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`btn btn-sm${done ? "" : " btn-primary"}`} onClick={onClick} aria-pressed={done} aria-label={label}>
      {done ? <><IconCheck size={14} /> Done</> : "Mark done"}
    </button>
  );
}

/** One session on the card: badge, title (to the full session), length, and Mark done. */
function SessionLine({ s, x, badge, done, toggle }: { s: WatchSource; x: Dated<Session>; badge: string; done: boolean; toggle: () => void }) {
  return (
    <div className="prep-line">
      <div className="prep-line-main">
        <span className="prep-badges">
          <Tag tone={badge === "Catch up" ? "tag-outline" : "tag-accent"}>{badge}</Tag>
          <span className="faint num">{kindLabel(x)}</span>
        </span>
        <Link href={`/watch/${s.id}?session=${x.session}`} className="prep-title">
          {x.session}. {x.title}
        </Link>
      </div>
      <DoneButton done={done} onClick={toggle} label={`Session ${x.session} done`} />
    </div>
  );
}

/** Today's session, missed ones to catch up on, or what's next. */
export function PrepCard({ s }: { s: WatchSource }) {
  const c = useCurriculum();
  const { done, toggle } = usePrepDone(c?.curriculum_id);
  const today = logicalToday();
  const st = c ? prepStatus(c.sessions, startOf(s), today, done) : null;
  const total = c?.sessions.length ?? 0;

  let body: React.ReactNode;
  if (!c) body = <p className="faint watch-empty">Loading…</p>;
  else if (!st) body = <p className="muted watch-empty">Pick day 1 (a Monday) in settings.</p>;
  else if (st.done === total) body = <p className="muted watch-empty">All {total} sessions done. Run the final review from session {total}.</p>;
  else if (today < st.all[0].date) {
    body = (
      <div className="watch-lines">
        <div>Starts {when(st.all[0].date)}: <Link href={`/watch/${s.id}?session=1`}>{st.all[0].title}</Link></div>
        <p className="faint prep-note">{c.baseline_note}</p>
      </div>
    );
  } else {
    body = (
      <div className="watch-lines">
        {st.today && (
          <>
            <SessionLine s={s} x={st.today} badge={st.today.kind === "mock" ? "Mock today" : "Today"} done={done.has(st.today.session)} toggle={() => toggle(st.today!.session)} />
            <p className="faint prep-note">{st.today.goal}</p>
          </>
        )}
        {st.missed.map((x) => (
          <SessionLine key={x.session} s={s} x={x} badge="Catch up" done={false} toggle={() => toggle(x.session)} />
        ))}
        {!st.today && st.next && (
          <div className="faint prep-next">
            Next · {when(st.next.date)}: <Link href={`/watch/${s.id}?session=${st.next.session}`}>{st.next.title}</Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="card watch-card">
      <CardHead s={s} right={st && <span className="faint num">{st.done}/{total} done</span>} />
      {body}
      <Link href={INTERVIEWS} className="faint prep-next">Mock notes and LeetCode in Interviews →</Link>
    </section>
  );
}

// ---- The source's page --------------------------------------------------------------------

/** The whole plan by week, or one session in full when ?session=N. */
export function PrepView({ s }: { s: WatchSource }) {
  const c = useCurriculum();
  const n = Number(useSearchParams().get("session"));
  const { done, toggle } = usePrepDone(c?.curriculum_id);
  if (!c) return <p className="faint">Loading…</p>;
  const st = prepStatus(c.sessions, startOf(s), logicalToday(), done);
  if (!st) return <p className="muted">Pick day 1 (a Monday) in settings.</p>;
  const one = st.all.find((x) => x.session === n);
  if (one) return <PrepSession s={s} c={c} x={one} done={done.has(one.session)} toggle={() => toggle(one.session)} />;

  const today = logicalToday();
  return (
    <>
      <Link href={INTERVIEWS} className="faint prep-back">Mock notes and LeetCode in Interviews →</Link>
      {c.cycles.map((cy) => (
        <section key={cy.cycle} className="card list">
          <div className="group-head">
            <span className="label">Week {cy.cycle}</span>
            <div className="faint prep-note">{cy.theme}</div>
          </div>
          {st.all.filter((x) => x.cycle === cy.cycle).map((x) => (
            <Link key={x.session} href={`/watch/${s.id}?session=${x.session}`} className={`row prep-row${x.date === today ? " today" : ""}`}>
              <span className="prep-row-main">
                <span className="faint num">{when(x.date)} · {kindLabel(x)}</span>
                <span className={done.has(x.session) ? "prep-done" : undefined}>{x.session}. {x.title}</span>
              </span>
              {done.has(x.session) ? <IconCheck size={16} /> : x.date < today ? <Tag tone="tag-outline">Catch up</Tag> : null}
            </Link>
          ))}
        </section>
      ))}
      <details className="card prep-details">
        <summary className="label">Rubric and scoring</summary>
        <ul className="prep-list">{c.rubric.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="prep-body">{c.level_calibration}</p>
      </details>
    </>
  );
}

function Reveal({ q, a }: { q: string; a: string }) {
  return (
    <details className="prep-qa">
      <summary>{q}</summary>
      <p>{a}</p>
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card prep-block">
      <span className="label">{title}</span>
      {children}
    </section>
  );
}

/** One session, in the curriculum's order: warm-up, reading, then practice (or the mock). */
function PrepSession({ s, c, x, done, toggle }: { s: WatchSource; c: Curriculum; x: Dated<Session>; done: boolean; toggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const m = x.mock;
  const qa = (items: QA[]) => items.map((i) => <Reveal key={i.q} q={i.q} a={i.a} />);
  return (
    <>
      <Link href={`/watch/${s.id}`} className="faint prep-back">← All sessions</Link>
      <section className="card prep-block">
        <span className="faint num">Session {x.session} · Week {x.cycle} · {when(x.date)} · {kindLabel(x)}</span>
        <h2 className="prep-h">{x.title}</h2>
        <p className="prep-body">{x.goal}</p>
        <DoneButton done={done} onClick={toggle} label={`Session ${x.session} done`} />
      </section>

      {x.warmup.length > 0 && (
        <Block title="Warm-up · 5 min">
          <p className="faint prep-note">{x.warmup_note}</p>
          {qa(x.warmup)}
        </Block>
      )}

      {x.sections.map((sec) => (
        <Block key={sec.heading} title={sec.heading}>
          <p className="prep-body">{sec.body}</p>
        </Block>
      ))}

      {m && (
        <>
          <Block title="Mock prompt">
            <p className="prep-body">{m.prompt}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(mockPrompt(c, m));
                  setCopied(true);
                } catch {}
              }}
            >
              {copied ? "Copied" : "Copy interviewer prompt"}
            </button>
          </Block>
          <Block title="The 45 minutes">
            {m.clock.map((p) => (
              <div key={p.phase} className="prep-clock">
                <span className="num prep-min">{p.minutes}m</span>
                <div>
                  <div className="prep-title">{p.phase}</div>
                  <p className="prep-body">{p.what_to_do}</p>
                </div>
              </div>
            ))}
          </Block>
          <Block title="Numbers to hit">
            <ul className="prep-list">{m.numbers_to_hit.map((t) => <li key={t}>{t}</li>)}</ul>
          </Block>
          <Block title="Must-say terms">
            <div className="prep-tags">{m.must_say_terms.map((t) => <Tag key={t} tone="tag-outline">{t}</Tag>)}</div>
          </Block>
          <Block title="Pressure questions">
            {m.pressure_questions.map((p) => <Reveal key={p.q} q={p.q} a={p.strong_answer} />)}
          </Block>
          <Block title="Common traps">
            <ul className="prep-list">{m.common_traps.map((t) => <li key={t}>{t}</li>)}</ul>
          </Block>
          <Block title="Senior signals">
            <ul className="prep-list">{m.senior_signals.map((t) => <li key={t}>{t}</li>)}</ul>
          </Block>
          <Block title="After the mock">
            <p className="prep-body">{m.after_mock}</p>
            <Link href={INTERVIEWS} className="btn">Open System Design Mocks</Link>
          </Block>
        </>
      )}

      {x.key_terms.length > 0 && (
        <Block title="Key terms">
          <dl className="prep-terms">
            {x.key_terms.map((t) => (
              <div key={t.term}>
                <dt>{t.term}</dt>
                <dd>{t.definition}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}
      {x.say_it_out_loud.length > 0 && (
        <Block title="Say it out loud">
          <ul className="prep-list">{x.say_it_out_loud.map((t) => <li key={t}>{t}</li>)}</ul>
        </Block>
      )}
      {x.interviewer_follow_ups.length > 0 && (
        <Block title="Interviewer follow-ups">
          {x.interviewer_follow_ups.map((f) => <Reveal key={f.q} q={f.q} a={f.strong_answer} />)}
        </Block>
      )}
      {x.drill.length > 0 && <Block title="Drills">{qa(x.drill)}</Block>}
    </>
  );
}
