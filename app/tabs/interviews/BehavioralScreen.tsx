"use client";

// The Behavioral tab of Interviews: a full mock behavioral round.
//   1. Setup: company, role, the job description (PDF and/or pasted), and whether to end
//      with "Why this company?".
//   2. The Architect writes the whole round at once: one tailored question for each of the
//      six areas (plus the fit question), each with a rubric and a target length.
//   3. Hot mic, one question at a time: the question, a big mic button and a clock that
//      counts up while you talk. It never cuts you off; going past the target shows in red.
//   4. The Grader grades each answer's content; code takes off the Yap Penalty for running long.
//   5. Summary: the overall score and every question's; copy the full scorecard, or any one
//      question's "second opinion" prompt for another model.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevron, IconMic, IconStop } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { ArchiveButton, ArchivedBar } from "@/components/TabArchive";
import { ScreenHeader, Tag } from "@/components/ui";
import { fmtDay } from "@/lib/date";
import { lastAnswer, mockApi, readPdf, useMockHistory, type MockQuestion, type MockSession, type PdfFile } from "@/lib/mock/data";
import { areasFor, externalPrompt, fmtClock, mockScorecard, overall, scorecard, yapPenalty, YAP_STEP_SECONDS } from "@/lib/mock/score";
import { useDictation } from "@/lib/useDictation";

const PDF_MAX_BYTES = 3_000_000;

type Question = MockSession["questions"][number];

type Stage =
  | { kind: "setup" }
  | { kind: "question"; sessionId: string; index: number; view: "answer" | "result" }
  | { kind: "summary"; sessionId: string };

const dateOf = (s: MockSession) => fmtDay(s.created.slice(0, 10));
const overallOf = (s: MockSession) => overall(s.questions.map(lastAnswer).filter((a) => a != null).map((a) => a!.final));

export function BehavioralScreen({ switcher }: { switcher?: ReactNode }) {
  const history = useMockHistory();
  const [stage, setStage] = useState<Stage>({ kind: "setup" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (next: Stage) => {
    setError(null);
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!history.rows && !history.failed) return <PageSkeleton />;

  const session = stage.kind === "setup" ? null : history.rows?.find((s) => s.id === stage.sessionId) ?? null;
  // The mock was removed (or hasn't loaded): back to setup.
  const view = stage.kind !== "setup" && !session && !busy ? { kind: "setup" as const } : stage;

  /** After question `index`: the next one, or the summary after the last. */
  const after = (s: MockSession, index: number): Stage =>
    index + 1 < s.questions.length ? { kind: "question", sessionId: s.id, index: index + 1, view: "answer" } : { kind: "summary", sessionId: s.id };

  /** Where a mock picks up: the first unanswered question, or the summary when all are done. */
  const resume = (s: MockSession): Stage => {
    const i = s.questions.findIndex((q) => !lastAnswer(q));
    return i < 0 ? { kind: "summary", sessionId: s.id } : { kind: "question", sessionId: s.id, index: i, view: "answer" };
  };

  return (
    <main className="screen">
      <ScreenHeader title="Interviews" back="/tabs" right={<ArchiveButton tab="behavioral" />} />
      {switcher}
      <ArchivedBar tab="behavioral" />

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {error}
        </p>
      )}

      {busy ? (
        <div className="card pad mock-busy" role="status">
          <span className="spin-dot" aria-hidden />
          <span className="muted">{busy}</span>
        </div>
      ) : view.kind === "setup" || !session ? (
        <>
          <Setup
            onError={setError}
            onStart={async (m) => {
              setBusy(`The hiring manager is reading the role and writing your ${areasFor(m.includeFit).length} questions. This takes a minute…`);
              setError(null);
              const r = await mockApi.start(m);
              if (!r.ok) {
                setBusy(null);
                return setError(r.error);
              }
              await history.reload();
              setBusy(null);
              go({ kind: "question", sessionId: r.value.sessionId, index: 0, view: "answer" });
            }}
          />
          {history.failed && <p className="muted">Couldn&rsquo;t load past mocks.</p>}
          {history.rows && history.rows.length > 0 && (
            <Past
              rows={history.rows}
              onOpen={(s) => go(resume(s))}
              onRemove={async (s) => {
                if (!(await mockApi.remove(s.id))) setError("Couldn't remove that mock.");
                history.reload();
              }}
            />
          )}
        </>
      ) : view.kind === "summary" ? (
        <Summary
          s={session}
          onOpen={(i) => go({ kind: "question", sessionId: session.id, index: i, view: lastAnswer(session.questions[i]) ? "result" : "answer" })}
          onNew={() => go({ kind: "setup" })}
        />
      ) : (
        (() => {
          const q = session.questions[view.index];
          const head = (
            <div className="mock-progress">
              <span className="label num">
                Question {view.index + 1} of {session.questions.length}
              </span>
              <span className="faint">{q.area}</span>
              <div className="mock-dots" aria-hidden>
                {session.questions.map((x, i) => (
                  <span key={x.id} className={`${i === view.index ? "now" : ""}${lastAnswer(x) ? " done" : ""}`} />
                ))}
              </div>
            </div>
          );
          return view.view === "answer" || !lastAnswer(q) ? (
            <HotMic
              // A fresh mic and clock for each question and each retry.
              key={`${q.id}-${q.answers.length}`}
              head={head}
              s={session}
              question={q}
              last={view.index + 1 === session.questions.length}
              onError={setError}
              onGrade={async (text, seconds) => {
                setBusy("The screener is grading your answer…");
                setError(null);
                const r = await mockApi.grade(q.id, text, seconds);
                if (!r.ok) {
                  setBusy(null);
                  return setError(r.error);
                }
                await history.reload();
                setBusy(null);
                go({ ...view, view: "result" });
              }}
              onSkip={() => go(after(session, view.index))}
              onEnd={() => go({ kind: "summary", sessionId: session.id })}
            />
          ) : (
            <Result
              head={head}
              s={session}
              q={q}
              last={view.index + 1 === session.questions.length}
              onRetry={() => go({ ...view, view: "answer" })}
              onNext={() => go(after(session, view.index))}
              onSummary={() => go({ kind: "summary", sessionId: session.id })}
            />
          );
        })()
      )}
    </main>
  );
}

// ---- 1. Setup ----------------------------------------------------------------------------------

function Setup({ onStart, onError }: { onStart: (m: { company: string; role: string; includeFit: boolean; context: string; pdf: PdfFile | null }) => void; onError: (e: string | null) => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [context, setContext] = useState("");
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [includeFit, setIncludeFit] = useState(true);
  const ready = company.trim() && role.trim();
  const n = areasFor(includeFit).length;

  return (
    <section className="card pad mock-setup">
      <div>
        <span className="label">New behavioral mock</span>
        <p className="faint" style={{ fontSize: "var(--t-sm)", margin: "4px 0 0" }}>
          A full round: one question for each area (conflict, failure, ambiguity, leadership, ownership, teamwork){includeFit ? ", then why this company" : ""}.
        </p>
      </div>
      <div className="form">
        <label className="field">
          <span className="label">Company</span>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Stripe" maxLength={100} />
        </label>
        <label className="field">
          <span className="label">Role</span>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Product Engineer" maxLength={100} />
        </label>
        <label className="field full">
          <span className="label">Job description (PDF, optional)</span>
          <input
            className="input"
            type="file"
            accept="application/pdf"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              onError(null);
              if (!f) return setPdf(null);
              if (f.size > PDF_MAX_BYTES) {
                e.target.value = "";
                return onError("That PDF is over 3 MB. Paste the text instead.");
              }
              try {
                setPdf(await readPdf(f));
              } catch {
                onError("Couldn't read that file.");
              }
            }}
          />
        </label>
        <label className="field full">
          <span className="label">Or paste the job description / company values (optional)</span>
          <textarea className="input" rows={4} value={context} onChange={(e) => setContext(e.target.value)} maxLength={20_000} />
        </label>
      </div>
      <div className="row" style={{ padding: 0, background: "transparent" }}>
        <span className="row-label">End with &ldquo;Why this company?&rdquo;</span>
        <button type="button" role="switch" className="switch" aria-checked={includeFit} aria-label="Include why this company" onClick={() => setIncludeFit(!includeFit)} />
      </div>
      <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => onStart({ company: company.trim(), role: role.trim(), includeFit, context: context.trim(), pdf })}>
        Start {n}-question mock
      </button>
    </section>
  );
}

// ---- 2–3. Hot mic ------------------------------------------------------------------------------

/** A count-up clock that runs only while the mic is on, and keeps its total across pauses. */
function useClock() {
  const [running, setRunning] = useState(false);
  const banked = useRef(0); // ms from earlier runs
  const since = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);

  const ms = banked.current + (since.current != null ? Date.now() - since.current : 0);
  return {
    seconds: Math.floor(ms / 1000),
    running,
    start: () => {
      since.current = Date.now();
      setRunning(true);
    },
    stop: () => {
      if (since.current != null) banked.current += Date.now() - since.current;
      since.current = null;
      setRunning(false);
    },
    reset: () => {
      banked.current = 0;
      since.current = null;
      setRunning(false);
    },
  };
}

function HotMic({
  head, s, question, last, onGrade, onSkip, onEnd, onError,
}: {
  head: ReactNode; s: MockSession; question: MockQuestion; last: boolean;
  onGrade: (text: string, seconds: number) => void; onSkip: () => void; onEnd: () => void; onError: (e: string | null) => void;
}) {
  const [text, setText] = useState("");
  const clock = useClock();
  const dictation = useDictation(setText, (m) => onError(m));
  const over = clock.seconds > question.target;
  const penalty = yapPenalty(clock.seconds, question.target);

  const toggle = () => {
    onError(null);
    if (clock.running) {
      clock.stop();
      if (dictation.supported) dictation.stop();
    } else {
      clock.start();
      if (dictation.supported) dictation.start(text ? `${text} ` : "");
    }
  };

  return (
    <section className="mock-hot">
      {head}
      <p className="mock-question">{question.question}</p>
      <span className="faint" style={{ fontSize: "var(--t-xs)" }}>
        {s.company}, {s.role}
      </span>

      <div className={`mock-clock num${over ? " over" : ""}`} aria-live="off">
        {fmtClock(clock.seconds)}
        <small>/ {fmtClock(question.target)}</small>
      </div>
      {over && (
        <p className="mock-yap num" role="status">
          Over by {clock.seconds - question.target}s{penalty ? ` · Yap Penalty −${penalty}` : ` · −1 every ${YAP_STEP_SECONDS}s over`}
        </p>
      )}

      <button type="button" className={`mock-mic${clock.running ? " live" : ""}`} aria-pressed={clock.running} aria-label={clock.running ? "Stop" : "Start answering"} onClick={toggle}>
        {clock.running ? <IconStop size={40} /> : <IconMic size={40} />}
      </button>
      <p className="faint" style={{ fontSize: "var(--t-xs)", textAlign: "center", margin: 0 }}>
        {clock.running
          ? dictation.supported ? "Listening. Tap to stop." : "Clock running. Use your keyboard's mic to dictate, then tap to stop."
          : clock.seconds ? "Paused. Tap to keep going." : "Tap and answer out loud. The clock starts with the mic."}
      </p>

      <label className="field full">
        <span className="label">Your answer (fix any dictation mistakes before grading)</span>
        <textarea
          className="input"
          rows={7}
          value={text}
          onChange={(e) => {
            // Typing takes over from the mic so the two don't fight.
            if (dictation.listening) dictation.cancel();
            setText(e.target.value);
          }}
        />
      </label>

      <div className="sheet-actions">
        <button type="button" className="btn" disabled={clock.running} onClick={onEnd}>
          End mock
        </button>
        <button type="button" className="btn" disabled={clock.running} onClick={onSkip}>
          {last ? "Skip to summary" : "Skip"}
        </button>
        <button type="button" className="btn btn-primary" disabled={clock.running || !text.trim()} onClick={() => onGrade(text.trim(), clock.seconds)}>
          Grade
        </button>
      </div>
      {(text || clock.seconds > 0) && !clock.running && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "center" }}
          onClick={() => {
            setText("");
            clock.reset();
          }}
        >
          Clear and start this one over
        </button>
      )}
    </section>
  );
}

// ---- 4. One question's grade ---------------------------------------------------------------------

function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [state, setState] = useState<"" | "Copied" | "Failed">("");
  return (
    <button
      type="button"
      className="btn"
      style={state === "Failed" ? { color: "var(--danger)" } : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setState("Copied");
        } catch {
          setState("Failed");
        }
        setTimeout(() => setState(""), 2000);
      }}
    >
      {state || label}
    </button>
  );
}

function Result({
  head, s, q, last, onRetry, onNext, onSummary,
}: { head: ReactNode; s: MockSession; q: Question; last: boolean; onRetry: () => void; onNext: () => void; onSummary: () => void }) {
  const answer = lastAnswer(q)!;
  const g = answer.graded;
  const card = () => scorecard({ n: q.position, company: s.company, role: s.role, bucket: q.area, question: q.question, target: answer.target, duration: answer.duration, graded: g });
  const second = () => externalPrompt({
    company: s.company, role: s.role, bucket: q.area, question: q.question, rubric: q.rubric,
    target: answer.target, duration: answer.duration, transcription: answer.transcription,
  });

  return (
    <section className="mock-result">
      {head}
      <p className="mock-question small">{q.question}</p>

      <div className="card pad mock-score">
        <div className="mock-score-big num">
          {answer.final}<small>/10</small>
        </div>
        <div className="mock-score-parts num">
          <span>Content {g.content}/10</span>
          <span className={answer.penalty ? "over" : undefined}>{answer.penalty ? `Yap Penalty −${answer.penalty}` : "No Yap Penalty"}</span>
          <span className="faint">
            {fmtClock(answer.duration)} of {fmtClock(answer.target)} target
          </span>
          {q.answers.length > 1 && <span className="faint">Try {q.answers.length} (earlier: {q.answers.slice(0, -1).map((a) => a.final).join(", ")})</span>}
        </div>
      </div>

      <div className="card pad mock-feedback">
        <span className="label">What worked</span>
        <p>{g.worked || "–"}</p>
        <span className="label">What failed</span>
        <p>{g.failed || "–"}</p>
        {g.tip && (
          <>
            <span className="label">Next time</span>
            <p>{g.tip}</p>
          </>
        )}
      </div>

      {g.checks.length > 0 && (
        <div className="card list">
          {g.checks.map((c, i) => (
            <div key={i} className="row mock-check">
              <Tag tone={c.met ? "tag-1" : "tag-outline"}>{c.met ? "Met" : "Missed"}</Tag>
              <span className="row-label">
                {c.requirement}
                {c.note && <span className="cell-sub">{c.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <details className="card archived-acc">
        <summary>
          <span className="label">Your answer</span>
          <IconChevron />
        </summary>
        <p className="mock-transcript">{answer.transcription}</p>
      </details>

      <div className="mock-actions">
        <CopyButton label="Copy scorecard" text={card} />
        <CopyButton label="Copy second-opinion prompt" text={second} />
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onSummary}>
          Summary
        </button>
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {last ? "Finish" : "Next question"}
        </button>
      </div>
    </section>
  );
}

// ---- 5. The whole mock -----------------------------------------------------------------------------

function Summary({ s, onOpen, onNew }: { s: MockSession; onOpen: (index: number) => void; onNew: () => void }) {
  const avg = overallOf(s);
  const answered = s.questions.filter((q) => lastAnswer(q)).length;
  const full = () => mockScorecard({
    company: s.company, role: s.role, date: dateOf(s),
    questions: s.questions.map((q) => {
      const a = lastAnswer(q);
      return { area: q.area, question: q.question, target: q.target, duration: a?.duration ?? null, graded: a?.graded ?? null };
    }),
  });

  return (
    <section className="mock-result">
      <div className="faint" style={{ fontSize: "var(--t-sm)" }}>
        {s.company}, {s.role} · {dateOf(s)}
      </div>
      <div className="card pad mock-score">
        <div className="mock-score-big num">
          {avg ?? "–"}<small>/10</small>
        </div>
        <div className="mock-score-parts num">
          <span>Overall</span>
          <span className="faint">
            {answered} of {s.questions.length} answered
          </span>
        </div>
      </div>

      <div className="card list">
        {s.questions.map((q, i) => {
          const a = lastAnswer(q);
          return (
            <button key={q.id} type="button" className="row mock-sum-row" onClick={() => onOpen(i)}>
              <span className="row-label">
                <span className="label num">Q{i + 1} · {q.area}</span>
                <span className="mock-sum-q">{q.question}</span>
              </span>
              <span className={`num mock-sum-score${a ? "" : " faint"}`}>{a ? `${a.final}/10` : "Answer"}</span>
              <IconChevron />
            </button>
          );
        })}
      </div>

      <div className="mock-actions">
        <CopyButton label="Copy full scorecard" text={full} />
        <button type="button" className="btn btn-primary" onClick={onNew}>
          New mock
        </button>
      </div>
    </section>
  );
}

// ---- Past mocks --------------------------------------------------------------------------------

function Past({ rows, onOpen, onRemove }: { rows: MockSession[]; onOpen: (s: MockSession) => void; onRemove: (s: MockSession) => void }) {
  return (
    <details className="card archived-acc">
      <summary>
        <span className="label">Past mocks ({rows.length})</span>
        <IconChevron />
      </summary>
      {rows.map((s) => {
        const avg = overallOf(s);
        const answered = s.questions.filter((q) => lastAnswer(q)).length;
        return (
          <div key={s.id} className="mock-past">
            <button type="button" className="row" onClick={() => onOpen(s)}>
              <span className="row-label">
                <span className="cell-main">{s.company}, {s.role}</span>
                <span className="cell-sub num">
                  {dateOf(s)} · {answered === s.questions.length ? "done" : `${answered} of ${s.questions.length} answered`}
                </span>
              </span>
              <span className="row-value num">{avg == null ? "–" : `${avg}/10`}</span>
              <IconChevron />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => onRemove(s)}>
              Remove
            </button>
          </div>
        );
      })}
    </details>
  );
}
