"use client";

// Settings > End of day: the questions "EOD" asks in chat, in order. Each says what it
// asks and where the answer goes; switched-off ones are skipped. Changes save as they're
// made, so the next "EOD" uses them.

import { useCallback, useEffect, useState } from "react";
import { EOD_TARGETS, isEodTarget, type EodQuestion } from "@/lib/eod";
import { eodApi, loadEodQuestions } from "@/lib/eodData";

const MAX_PROMPT = 200;

export function EodSettings() {
  const [qs, setQs] = useState<EodQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await loadEodQuestions();
    if (data) setQs(data);
    else setFailed(true);
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

      <button
        type="button"
        className="btn"
        onClick={async () => {
          const prompt = "What else happened today?";
          const id = await eodApi.add(qs.length, prompt, "journal");
          if (id) setQs([...qs, { id, position: qs.length, prompt, target: "journal", enabled: true }]);
          else setNotice("Failed to add.");
        }}
      >
        Add a question
      </button>
      {notice && <p role="alert" className="muted">{notice}</p>}
    </>
  );
}
