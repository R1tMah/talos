"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { IconArrowUp, IconCheck } from "@/components/Icons";
import { Diagram } from "@/components/learning/Diagram";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { askTutor, dayLabel, learningApi, useLesson } from "@/lib/learning/data";

type Bubble = { role: "user" | "assistant"; content: string };

/**
 * The daily classroom: the module's diagram and 3–4 bullets on top (side by side on wide
 * screens), and the Tutor's chat below, opening with its question about the diagram.
 */
export default function LessonPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const router = useRouter();
  const { lesson, failed, reload } = useLesson(moduleId);
  const [chat, setChat] = useState<Bubble[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);
  const [sheet, setSheet] = useState<"recalibrate" | null>(null);
  const [recal, setRecal] = useState<"idle" | "working" | string>("idle");
  const endRef = useRef<HTMLDivElement>(null);

  // The saved transcript, once per module.
  useEffect(() => {
    if (lesson && chat === null) setChat(lesson.messages.map((m) => ({ role: m.role, content: m.content })));
  }, [lesson, chat]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  if (!lesson) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Lesson" back="/tabs/learning" />
        <p role="alert" className="muted">
          {failed === "missing" ? "This lesson doesn't exist." : "Failed."}{" "}
          {failed === "error" && <button type="button" className="btn btn-sm" onClick={reload}>Retry</button>}
        </p>
      </main>
    ) : <PageSkeleton />;
  }

  const { curriculum: c, module: m } = lesson;
  const replaced = !!m.replacedAt;
  const complete = !!m.completedAt;
  const nextUp = c.next && c.next.id !== m.id ? c.next : null;

  const send = async () => {
    const t = text.trim();
    if (!t || busy || replaced) return;
    setText("");
    setError(null);
    setBusy(true);
    setChat((prev) => [...(prev ?? []), { role: "user", content: t }, { role: "assistant", content: "" }]);
    await askTutor(m.id, t, (e) => {
      if (e.type === "text") {
        setChat((prev) => {
          const next = [...(prev ?? [])];
          next[next.length - 1] = { role: "assistant", content: next[next.length - 1].content + e.text };
          return next;
        });
      } else if (e.type === "complete") {
        setJustDone(true);
      } else if (e.type === "error") {
        setError(e.message);
      }
    });
    // Drop an empty reply bubble (the turn failed before any words).
    setChat((prev) => (prev && prev.at(-1)?.role === "assistant" && !prev.at(-1)!.content.trim() ? prev.slice(0, -1) : prev));
    setBusy(false);
    reload();
  };

  const markDone = async () => {
    const r = await learningApi.markDone(m.id);
    if (!r.ok) return setError(r.error);
    setJustDone(true);
    reload();
  };

  const reopen = async () => {
    const r = await learningApi.reopen(m.id);
    if (!r.ok) return setError(r.error);
    setJustDone(false);
    reload();
  };

  const recalibrate = async () => {
    setRecal("working");
    const r = await learningApi.recalibrate(m.id);
    if (!r.ok) return setRecal(r.error);
    setRecal("idle");
    setSheet(null);
    if (r.data.firstModuleId) router.replace(`/tabs/learning/lesson/${r.data.firstModuleId}`);
    else reload();
  };

  return (
    <main className="screen lesson">
      <ScreenHeader title={c.title ?? c.topic} back={`/tabs/learning/${c.id}`} stickyBack />

      <div className="lesson-grid">
        <section className="card pad lesson-stage">
          <span className="label">
            {replaced ? "Replaced module" : `Module ${lesson.number} of ${c.modules.length}`}
            {!replaced && !complete && m.date && ` · ${dayLabel(m.date)}`}
          </span>
          <h2 className="lesson-title">{m.title}</h2>
          <Diagram source={m.diagram} caption={m.diagramCaption} />
          <ul className="lesson-bullets">
            {m.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>

        <section className="lesson-chat" aria-label="Tutor">
          {replaced && <p className="faint lesson-note">Recalibrate replaced this module with gentler steps. The chat is kept here as a record.</p>}
          {(complete || justDone) && !replaced && (
            <div className="card pad lesson-done" role="status">
              <span className="lesson-done-check"><IconCheck size={16} /></span>
              <div>
                <div className="cell-main">Module complete</div>
                <div className="cell-sub">
                  {nextUp ? `Next: ${nextUp.title}${nextUp.date ? `, ${dayLabel(nextUp.date)}` : ""}` : "That was the last module."}
                </div>
              </div>
              {nextUp && (
                <button type="button" className="btn btn-sm" onClick={() => router.push(`/tabs/learning/lesson/${nextUp.id}`)}>Open next</button>
              )}
            </div>
          )}

          <div className="msg-tutor">{m.openingQuestion}</div>
          {(chat ?? []).map((b, i) =>
            b.role === "user" ? (
              <div key={i} className="msg-user">{b.content}</div>
            ) : (
              <div key={i} className="msg-tutor">{b.content || <span className="faint">…</span>}</div>
            ),
          )}
          {error && <p role="alert" className="lesson-error">{error}</p>}
          <div ref={endRef} />

          {!replaced && (
            <div className="lesson-tools">
              <button type="button" className="btn btn-sm" onClick={() => setSheet("recalibrate")} disabled={busy}>Recalibrate</button>
              {complete || justDone ? (
                <button type="button" className="btn btn-sm" onClick={reopen} disabled={busy}>Reopen</button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={markDone} disabled={busy}>Mark done</button>
              )}
            </div>
          )}
        </section>
      </div>

      {!replaced && (
        <div className="composer lesson-composer">
          <form className="composer-inner" onSubmit={(e) => (e.preventDefault(), send())}>
            <div className="composer-field">
              <textarea
                rows={1}
                value={text}
                placeholder={busy ? "Tutor is thinking…" : "Answer or ask the tutor"}
                enterKeyHint="send"
                autoCapitalize="sentences"
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
            </div>
            <button type="submit" className="round-btn send" aria-label="Send" disabled={!text.trim() || busy}>
              <IconArrowUp />
            </button>
          </form>
        </div>
      )}

      {sheet === "recalibrate" && (
        <Sheet title="Recalibrate" onClose={() => recal !== "working" && (setSheet(null), setRecal("idle"))}>
          {recal === "working" ? (
            <p className="muted">Rewriting the rest of the curriculum around where you got stuck… this takes a minute or two. Keep this page open.</p>
          ) : (
            <>
              <p className="muted">
                Your chat on this module goes to the Architect, which rewrites this module and the ones after it as smaller, gentler steps.
                The current ones stay visible as &quot;replaced&quot;. Uses one of your 5 builds for today.
              </p>
              {recal !== "idle" && <p role="alert" className="lesson-error">{recal}</p>}
              <div className="sheet-actions">
                <button type="button" className="btn" onClick={() => (setSheet(null), setRecal("idle"))}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={recalibrate}>Recalibrate</button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </main>
  );
}
