"use client";

// Chess: today's record, games and the ratings for rapid, blitz and bullet, read live
// from the owner's chess.com account (lib/chess.ts). Games aren't stored; a note on a
// game is (public.chess_notes). "Today" is the app's 4 AM to 4 AM day on this device.

import { useMemo, useState } from "react";
import { FormSheet } from "@/components/FormSheet";
import { IconPlus } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { CHESS_PROFILE, CLASSES, dayBounds, dayRecord, daySummary, fmtChange, fmtRecord, type ChessGame } from "@/lib/chess";
import { chessNotesApi, useChess, useChessNotes } from "@/lib/chessData";
import { fmtNum } from "@/lib/date";
import { showToast } from "@/lib/undo";

const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const OUTCOME = { win: "W", loss: "L", draw: "D" } as const;

export default function ChessPage() {
  const { data, failed, loading, reload } = useChess();
  const { start, end } = dayBounds();
  const day = useMemo(() => (data ? daySummary(data.games, start, end) : null), [data, start, end]);
  const today = useMemo(() => (data ? data.games.filter((g) => g.end >= start && g.end < end).reverse() : []), [data, start, end]);
  const { notes, loaded: notesLoaded, reload: reloadNotes } = useChessNotes(today.map((g) => g.url));
  // A new object per opening, so a late save closes only the sheet it came from.
  const [sheet, setSheet] = useState<{ g: ChessGame } | null>(null);

  // The sheet stays open (with the draft) until the write succeeds.
  const saveNote = async (from: { g: ChessGame }, body: string) => {
    const r = await chessNotesApi.set(from.g.url, body);
    if (r.status !== "saved") return showToast({ text: "Couldn't save the note.", tone: "error" });
    setSheet((s) => (s === from ? null : s));
    await reloadNotes();
  };

  const header = (
    <ScreenHeader
      title="Chess"
      back="/tabs"
      right={
        <button type="button" className="btn btn-sm" onClick={() => (reload(), reloadNotes())} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    />
  );
  if (!data) {
    return (
      <main className="screen">
        {header}
        {failed ? <p role="alert" className="muted">Couldn&rsquo;t reach chess.com. Try Refresh.</p> : <PageSkeleton />}
      </main>
    );
  }

  const record = dayRecord(data.games, start, end);

  return (
    <main className="screen">
      {header}
      <a className="faint chess-user" href={CHESS_PROFILE} target="_blank" rel="noopener noreferrer">
        {data.username} on chess.com
      </a>

      <SummaryStrip items={[{ label: "Record today", value: fmtRecord(record, true), sub: "W-L-D" }]} />

      <SectionTitle>Ratings</SectionTitle>
      <div className="chess-classes">
        {CLASSES.map(({ key, label }) => {
          const s = data.stats[key];
          const d = day![key];
          return (
            <section key={key} className="card chess-class">
              <span className="label">{label}</span>
              <span className="stat-value num">{s.rating != null ? fmtNum(s.rating) : "–"}</span>
              <span className={`num chess-change${d.change == null ? "" : d.change > 0 ? " up" : d.change < 0 ? " down" : ""}`}>
                {d.change != null ? `${fmtChange(d.change)} today` : d.played ? "Unrated today" : "No games today"}
              </span>
              <span className="faint num chess-sub">
                {d.played ? `${d.played} today · ${d.win}W ${d.loss}L ${d.draw}D` : " "}
              </span>
              {s.best != null && <span className="faint num chess-sub">Best {fmtNum(s.best)}</span>}
            </section>
          );
        })}
      </div>

      <SectionTitle>Today&rsquo;s games</SectionTitle>
      {today.length ? (
        <section className="card list">
          {today.map((g) => (
            <GameRow key={g.url} g={g} note={notes[g.url]} canAdd={notesLoaded} onNote={() => setSheet({ g })} />
          ))}
        </section>
      ) : (
        <p className="muted">No rapid, blitz or bullet games yet today.</p>
      )}

      {sheet && (
        <FormSheet
          title={`Note: vs ${sheet.g.opp}`}
          fields={[{ name: "body", label: "Note", type: "textarea", trim: false, placeholder: "What happened this game?" }]}
          initial={{ body: notes[sheet.g.url] ?? "" }}
          onClose={() => setSheet(null)}
          onDelete={notes[sheet.g.url] != null ? () => saveNote(sheet, "") : undefined}
          onSubmit={(v) => saveNote(sheet, String(v.body ?? ""))}
        />
      )}
    </main>
  );
}

/**
 * A game: the row links to it on chess.com; the note (or "+" to add one) opens the note
 * sheet. "+" waits for the notes to load, so it never opens a blank sheet over a saved note.
 */
function GameRow({ g, note, canAdd, onNote }: { g: ChessGame; note: string | undefined; canAdd: boolean; onNote: () => void }) {
  const label = CLASSES.find((c) => c.key === g.cls)!.label;
  return (
    <div className="chess-game">
      <div className="chess-game-head">
        <a className="row" href={g.url} target="_blank" rel="noopener noreferrer">
          <span className={`chess-outcome ${g.outcome}`} aria-label={g.outcome}>
            {OUTCOME[g.outcome]}
          </span>
          <span className="row-label">
            {g.opp} <span className="faint num">({g.oppRating})</span>
            <span className="faint chess-meta">
              {label} · {g.color === "white" ? "White" : "Black"}
              {g.rated ? "" : " · Unrated"}
            </span>
          </span>
          <span className="row-value num">
            {g.rating} · {time(g.end)}
          </span>
        </a>
        {note == null && canAdd && (
          <button type="button" className="icon-btn chess-note-add" onClick={onNote} aria-label={`Add a note on the game vs ${g.opp}`}>
            <IconPlus />
          </button>
        )}
      </div>
      {note != null && (
        <button type="button" className="chess-note" onClick={onNote}>
          {note}
        </button>
      )}
    </div>
  );
}
