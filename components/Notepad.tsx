"use client";

import { useMemo, useState } from "react";
import { fmtDay, fmtDow, newestFirst, nowHM, todayISO, uid } from "@/lib/date";
import { live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { SwipeRow } from "./DataTable";
import { FullScreenEditor } from "./Editor";
import { EmptyState, Fab, ScreenHeader } from "./ui";

/** Dated plain-text entries. Tap to edit, swipe to delete. */
export function NotepadScreen({ coll, title }: { coll: "content" | "journal" | "notes"; title: string }) {
  const { db, add, update, remove } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => live(db[coll]).sort(newestFirst), [db, coll]);
  const current = db[coll].find((n) => n.id === open);

  const create = () => {
    const n: Note = { id: uid(), date: todayISO(), time: nowHM(), text: "" };
    add(coll, n);
    setOpen(n.id);
  };

  const close = () => {
    if (current && !current.text.trim()) remove(coll, current.id);
    setOpen(null);
  };

  return (
    <main className="screen">
      <ScreenHeader title={title} back="/tabs" />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState text="No entries." onAdd={create} />
        </div>
      ) : (
        <div className="card table">
          {rows.map((n) => (
            <SwipeRow key={n.id} cols="1fr" onClick={() => setOpen(n.id)} onDelete={() => remove(coll, n.id)}>
              <div className="note-row" style={{ padding: "4px 0" }}>
                <span className="label num">
                  {fmtDow(n.date)} {fmtDay(n.date)}, {n.time}
                </span>
                <div className="note-text">{n.text}</div>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
      <Fab onClick={create} label="New entry" />
      {current && (
        <FullScreenEditor
          title={`${fmtDow(current.date)} ${fmtDay(current.date)}`}
          value={current.text}
          onChange={(text) => update(coll, current.id, { text })}
          onDone={close}
        />
      )}
    </main>
  );
}
