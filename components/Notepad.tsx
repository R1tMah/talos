"use client";

import { ArchiveButton, ArchivedBar } from "./TabArchive";
import { useCallback, useEffect, useState } from "react";
import { fmtDay, fmtDow, logicalToday } from "@/lib/date";
import { notesApi, useNotes, type NoteKind } from "@/lib/notesData";
import { SwipeRow } from "./DataTable";
import { FullScreenEditor } from "./Editor";
import { IconCheck } from "./Icons";
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
 * the background, not on every keystroke. With `checkable`, each entry has a box to
 * mark it done; done entries stay on the list, struck through, below the open ones.
 */
export function NotepadScreen({ kind, title, checkable }: { kind: NoteKind; title: string; checkable?: boolean }) {
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
  // Open entries first, then done; newest first within each (the stable sort keeps the query's order).
  const shown = checkable ? [...rows].sort((a, b) => Number(a.done) - Number(b.done)) : rows;

  return (
    <main className="screen">
      <ScreenHeader title={title} back="/tabs" right={<><ArchiveButton tab={kind} /><ExportButton tab={kind} live={kind} /></>} />
      <ArchivedBar tab={kind} />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState text="No entries." onAdd={create} />
        </div>
      ) : (
        <div className="card table">
          {shown.map((n) => (
            <SwipeRow
              key={n.id}
              cols="1fr"
              onClick={() => setDraft({ id: n.id, date: n.date, text: n.body, saved: n.body })}
              onDelete={async () => {
                setError((await notesApi.remove(n.id)).status !== "saved");
                reload();
              }}
            >
              <div className={`note-row${checkable ? " checkable" : ""}${n.done ? " done" : ""}`} style={{ padding: "4px 0" }}>
                {checkable && (
                  <button
                    type="button"
                    className="note-check"
                    role="checkbox"
                    aria-checked={n.done}
                    aria-label={n.done ? "Mark not done" : "Mark done"}
                    // Keep the row from treating the tap as a swipe or an edit.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setError((await notesApi.setDone(n.id, !n.done)).status !== "saved");
                      reload();
                    }}
                  >
                    {n.done && <IconCheck size={14} />}
                  </button>
                )}
                <div className="note-main">
                  <span className="label num">
                    {fmtDow(n.date)} {fmtDay(n.date)}, {n.time}
                  </span>
                  <div className="note-text">{n.body}</div>
                </div>
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
