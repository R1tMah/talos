"use client";

import { useState, type ReactNode } from "react";
import { FullScreenEditor } from "./Editor";
import { IconChevron, IconPlus } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { ArchiveButton, ArchivedBar } from "./TabArchive";
import { ExportButton } from "./ExportButton";
import { logicalToday } from "@/lib/date";
import { seasonsApi, useSeasons, type Season, type SeasonNote } from "@/lib/seasonsData";
import { longTermExport, longTermText } from "@/lib/screenExports";

/** "Dec 16, 2023": seasons span years, so the year is always shown. */
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Editing =
  | { kind: "plan"; season: Season; text: string }
  | { kind: "note"; season: Season; note: SeasonNote | null; text: string };

/**
 * Long Term: every season the owner planned (a semester, a summer, a winter break),
 * with the plan written at the start and the dated updates and reviews written along
 * the way. All of it is the owner's own text, shown and saved exactly as written.
 */
export function LongTermScreen({ title = "Long Term", switcher, back = "/tabs" }: { title?: string; switcher?: ReactNode; back?: string }) {
  const { rows, failed, reload } = useSeasons();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState(false);

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title={title} back={back} />
        {switcher}
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

  const done = async () => {
    if (!editing) return;
    const e = editing;
    let res: { status: string } | null = null;
    if (e.kind === "plan") {
      if (e.text !== e.season.plan) res = await seasonsApi.update(e.season.id, e.season.name, e.text);
    } else if (e.note) {
      // Clearing an update removes it, as in the notepads.
      if (!e.text.trim()) res = await seasonsApi.removeNote(e.note.id);
      else if (e.text !== e.note.body) res = await seasonsApi.updateNote(e.note, e.text);
    } else if (e.text.trim()) {
      res = await seasonsApi.addNote(e.season.id, logicalToday(), e.text);
    }
    if (res && res.status !== "saved") return setError(true); // stay in the editor so nothing typed is lost
    setError(false);
    setEditing(null);
    reload();
  };

  const [current, ...past] = rows;

  return (
    <main className="screen">
      <ScreenHeader
        title={title}
        back={back}
        right={<><ArchiveButton tab="longterm" /><ExportButton tab="longterm" source={longTermExport(rows)} text={longTermText(rows)} order="oldest season first" /></>}
      />
      {switcher}
      <ArchivedBar tab="longterm" />
      {!current ? (
        <div className="card">
          <div className="empty"><span>No seasons yet.</span></div>
        </div>
      ) : (
        <>
          <SeasonCard s={current} current onEdit={setEditing} />
          {past.length > 0 && <span className="label group-title">Past seasons</span>}
          {past.map((s) => (
            <details key={s.id} className="card archived-acc season-past">
              <summary>
                <span className="season-name">{s.name}</span>
                <span className="faint season-meta">{s.notes.length ? `${s.notes.length} ${s.notes.length === 1 ? "update" : "updates"}` : ""}</span>
                <IconChevron />
              </summary>
              <SeasonCard s={s} onEdit={setEditing} />
            </details>
          ))}
        </>
      )}

      {editing && (
        <FullScreenEditor
          title={editing.kind === "plan" ? `${editing.season.name}: plan` : editing.note?.date ? fmtDate(editing.note.date) : "New update"}
          value={editing.text}
          onChange={(text) => setEditing({ ...editing, text })}
          onDone={done}
          right={error ? <span style={{ color: "var(--danger)", fontSize: "var(--t-sm)", alignSelf: "center" }}>Failed</span> : undefined}
        />
      )}
    </main>
  );
}

function SeasonCard({ s, current, onEdit }: { s: Season; current?: boolean; onEdit: (e: Editing) => void }) {
  return (
    <section className={current ? "card season season-current" : "season"}>
      {current && (
        <div className="season-head">
          <span className="label">Now</span>
          <span className="season-name">{s.name}</span>
        </div>
      )}
      <button type="button" className="season-text" onClick={() => onEdit({ kind: "plan", season: s, text: s.plan })}>
        {s.plan || <span className="faint">No plan written. Tap to add one.</span>}
      </button>
      {s.notes.map((n) => (
        <div key={n.id} className="season-note">
          <span className="label num">{[n.date && fmtDate(n.date), n.label].filter(Boolean).join(" · ")}</span>
          <button type="button" className="season-text" onClick={() => onEdit({ kind: "note", season: s, note: n, text: n.body })}>
            {n.body}
          </button>
        </div>
      ))}
      {current && (
        <button type="button" className="btn btn-sm season-add" onClick={() => onEdit({ kind: "note", season: s, note: null, text: "" })}>
          <IconPlus size={14} /> Add update
        </button>
      )}
    </section>
  );
}
