"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDay, fmtDow, logicalToday } from "@/lib/date";
import { notesApi, useNotes, type NoteKind } from "@/lib/notesData";
import { SwipeRow } from "./DataTable";
import { FullScreenEditor } from "./Editor";
import { ExportButton } from "./ExportButton";
import { PageSkeleton } from "./Skeleton";
import { EmptyState, Fab, ScreenHeader } from "./ui";

/** The entry being edited. `id` is null for a new entry that hasn't been saved yet. */
interface Draft {
  id: string | null;
  date: string;
  text: string;
  saved: string;
}

/**
 * Dated plain-text entries from Supabase (content ideas, work journal). Tap to edit,
 * swipe to delete. Text is saved exactly as typed, on Done or when the app goes to
 * the background, not on every keystroke.
 */
export function NotepadScreen({ kind, title }: { kind: NoteKind; title: string }) {
  const { rows, failed, reload } = useNotes(kind);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(false);

  const save = useCallback(async (d: Draft): Promise<Draft | null> => {
    if (d.text === d.saved) return d;
    // A new entry with nothing in it is simply not created.
    if (d.id === null && !d.text.trim()) return d;
    const res = d.id === null ? await notesApi.add(kind, d.date, d.text) : await notesApi.setBody(d.id, d.text);
    if (res.status !== "saved") return null;
    return { ...d, id: d.id ?? res.id ?? null, saved: d.text };
  }, [kind]);

  // iOS fires visibilitychange when switching apps or locking the phone.
  useEffect(() => {
    if (!draft) return;
    const onHide = async () => {
      if (document.visibilityState !== "hidden") return;
      const next = await save(draft);
      if (next) setDraft(next);
      setError(!next);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [draft, save]);

  const done = async () => {
    if (!draft) return;
    // Clearing an existing entry removes it (soft delete), as before.
    const res = draft.id !== null && !draft.text.trim() ? await notesApi.remove(draft.id) : null;
    const ok = res ? res.status === "saved" : (await save(draft)) !== null;
    setError(!ok);
    if (!ok) return; // stay in the editor so nothing typed is lost
    setDraft(null);
    reload();
  };

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title={title} back="/tabs" />
        <p role="alert" className="muted">
          Failed.{" "}
          <button type="button" className="btn btn-sm" onClick={reload}>
            Retry
          </button>
        </p>
      </main>
    ) : (
      <PageSkeleton />
    );
  }

  const create = () => setDraft({ id: null, date: logicalToday(), text: "", saved: "" });

  return (
    <main className="screen">
      <ScreenHeader title={title} back="/tabs" right={<ExportButton tab={kind} />} />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState text="No entries." onAdd={create} />
        </div>
      ) : (
        <div className="card table">
          {rows.map((n) => (
            <SwipeRow
              key={n.id}
              cols="1fr"
              onClick={() => setDraft({ id: n.id, date: n.date, text: n.body, saved: n.body })}
              onDelete={async () => {
                setError((await notesApi.remove(n.id)).status !== "saved");
                reload();
              }}
            >
              <div className="note-row" style={{ padding: "4px 0" }}>
                <span className="label num">
                  {fmtDow(n.date)} {fmtDay(n.date)}, {n.time}
                </span>
                <div className="note-text">{n.body}</div>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
      {error && !draft && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          Failed
        </p>
      )}
      <Fab onClick={create} label="New entry" />
      {draft && (
        <FullScreenEditor
          title={`${fmtDow(draft.date)} ${fmtDay(draft.date)}`}
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={done}
          right={error ? <span style={{ color: "var(--danger)", fontSize: "var(--t-sm)", alignSelf: "center" }}>Failed</span> : undefined}
        />
      )}
    </main>
  );
}
