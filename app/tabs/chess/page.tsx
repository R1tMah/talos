"use client";

// Chess: today's games and the ratings for bullet, blitz and rapid, read live from the
// owner's chess.com account (lib/chess.ts). Nothing is stored; "today" is the app's
// 4 AM to 4 AM day on this device.

import { useMemo } from "react";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { ScreenHeader, SectionTitle } from "@/components/ui";
import { CHESS_PROFILE, CLASSES, dayBounds, daySummary, fmtChange, type ChessGame } from "@/lib/chess";
import { useChess } from "@/lib/chessData";
import { fmtNum } from "@/lib/date";

const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const OUTCOME = { win: "W", loss: "L", draw: "D" } as const;

export default function ChessPage() {
  const { data, failed, loading, reload } = useChess();
  const { start, end } = dayBounds();
  const day = useMemo(() => (data ? daySummary(data.games, start, end) : null), [data, start, end]);
  const today = useMemo(() => (data ? data.games.filter((g) => g.end >= start && g.end < end).reverse() : []), [data, start, end]);

  const header = (
    <ScreenHeader
      title="Chess"
      back="/tabs"
      right={
        <button type="button" className="btn btn-sm" onClick={reload} disabled={loading}>
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

  const total = CLASSES.reduce((n, c) => n + day![c.key].played, 0);
  const sum = (k: "win" | "loss" | "draw") => CLASSES.reduce((n, c) => n + day![c.key][k], 0);

  return (
    <main className="screen">
      {header}
      <a className="faint chess-user" href={CHESS_PROFILE} target="_blank" rel="noopener noreferrer">
        {data.username} on chess.com
      </a>

      <SummaryStrip
        items={[
          { label: "Games today", value: total },
          { label: "Won", value: sum("win") },
          { label: "Lost", value: sum("loss") },
          { label: "Drawn", value: sum("draw") },
        ]}
      />

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
            <GameRow key={g.url} g={g} />
          ))}
        </section>
      ) : (
        <p className="muted">No bullet, blitz or rapid games yet today.</p>
      )}
    </main>
  );
}

function GameRow({ g }: { g: ChessGame }) {
  const label = CLASSES.find((c) => c.key === g.cls)!.label;
  return (
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
  );
}
