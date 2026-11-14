"use client";

// Settings > End of day: the questions "EOD" asks in chat, in order. Each says what it
// asks and where the answer goes; switched-off ones are skipped. Changes save as they're
// made, so the next "EOD" uses them.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROMPT, EOD_TARGETS, isEodTarget, type EodQuestion } from "@/lib/eod";
import { eodApi, loadEodAnswers, loadEodQuestions, type PastAnswer } from "@/lib/eodData";
import { fmtDay } from "@/lib/date";

const MAX_PROMPT = 200;

export function EodSettings() {
  const [qs, setQs] = useState<EodQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [past, setPast] = useState<Map<string, PastAnswer[]>>(new Map());

  const load = useCallback(async () => {
    const [data, answers] = await Promise.all([loadEodQuestions(), loadEodAnswers()]);
    if (data) setQs(data);
    else setFailed(true);
    if (answers) setPast(answers);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  /** Applies a change on screen, saves it, and reloads if the save fails. */
  const run = async (next: EodQuestion[], save: () => Promise<boolean | string | null>) => {
    setQs(next);
    setNotice("");
    if (!(await save())) {
      setNotice("Failed to save.");
      load();
    }
  };

  if (failed) return <p role="alert" className="muted">Failed to load your questions.</p>;
  if (!qs) return <p className="faint">Loading…</p>;

  const set = (id: string, change: Partial<EodQuestion>) => qs.map((q) => (q.id === id ? { ...q, ...change } : q));
  const move = (i: number, by: -1 | 1) => {
    const next = [...qs];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    run(next, () => eodApi.reorder(next.map((q) => q.id)));
  };
  const on = qs.filter((q) => q.enabled).length;

  return (
    <>
      <p className="faint eod-help">
        Type <b>EOD</b> in chat and Talos asks these one at a time. Answer each, or type <b>skip</b>; <b>stop</b> ends it. You see everything on
        one card before anything is saved. Typing <b>EOD:</b> followed by your whole day skips the questions.
      </p>
      <p className="faint eod-help">
        Ask anything: write your own question and set it to <b>Its own log</b> to keep its answers here, under the question, instead of
        in a journal. Those are only asked in the questions, not in an <b>EOD:</b> one-liner.
      </p>

      <span className="label group-title">
        Questions ({on} of {qs.length} on)
      </span>
      {qs.length === 0 && <p className="muted">No questions yet.</p>}
      {qs.map((q, i) => (
        <div key={q.id} className="card eod-q">
          <div className="eod-q-head">
            <span className="label">{i + 1}</span>
            <select
              className="row-select"
              aria-label="Where the answer goes"
              value={q.target}
              onChange={(e) => {
                const target = e.target.value;
                if (isEodTarget(target)) run(set(q.id, { target }), () => eodApi.update(q.id, { target }));
              }}
            >
              {EOD_TARGETS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button" role="switch" className="switch" aria-checked={q.enabled} aria-label={`Ask question ${i + 1}`}
              onClick={() => run(set(q.id, { enabled: !q.enabled }), () => eodApi.update(q.id, { enabled: !q.enabled }))}
            />
          </div>
          <textarea
            className="input eod-q-prompt"
            rows={2}
            maxLength={MAX_PROMPT}
            aria-label={`Question ${i + 1}`}
            defaultValue={q.prompt}
            onBlur={(e) => {
              const prompt = e.target.value.trim();
              if (!prompt) {
                e.target.value = q.prompt; // a question can't be blank
                return;
              }
              if (prompt !== q.prompt) run(set(q.id, { prompt }), () => eodApi.update(q.id, { prompt }));
            }}
          />
          {q.target === "custom" && <PastAnswers list={past.get(q.id) ?? []} prompt={q.prompt} />}
          <div className="rc-actions">
            <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`}>
              Up
            </button>
            <button type="button" className="btn btn-sm" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`}>
              Down
            </button>
            <button
              type="button" className="btn btn-sm eod-q-remove"
              onClick={() => run(qs.filter((x) => x.id !== q.id), () => eodApi.remove(q.id))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {/* Any tab or log: picking one adds its starter question, ready to reword above. */}
      <label className="eod-add">
        <span className="label">Add a question for</span>
        <select
          className="row-select"
          value=""
          onChange={async (e) => {
            const target = e.target.value;
            if (!isEodTarget(target)) return;
            const prompt = DEFAULT_PROMPT[target];
            const id = await eodApi.add(qs.length, prompt, target);
            if (id) setQs([...qs, { id, position: qs.length, prompt, target, enabled: true }]);
            else setNotice("Failed to add.");
          }}
        >
          <option value="" disabled>Pick a tab…</option>
          {EOD_TARGETS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}{t.key !== "custom" && qs.some((q) => q.target === t.key) ? " (already asked)" : ""}
            </option>
          ))}
        </select>
      </label>
      {notice && <p role="alert" className="muted">{notice}</p>}
    </>
  );
}

/** An own-log question's answers, newest first. Shows the wording asked, if it has changed since. */
function PastAnswers({ list, prompt }: { list: PastAnswer[]; prompt: string }) {
  if (!list.length) return <p className="faint eod-past-empty">No answers yet.</p>;
  return (
    <details className="eod-past">
      <summary>Answers ({list.length})</summary>
      {list.map((a) => (
        <div key={a.id} className="eod-line">
          <span className="eod-key">
            {fmtDay(a.date)}
            {a.prompt !== prompt && <span className="faint"> · asked: {a.prompt}</span>}
          </span>
          <span className="eod-val">{a.body}</span>
        </div>
      ))}
    </details>
  );
}
