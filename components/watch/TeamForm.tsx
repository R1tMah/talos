"use client";

// Settings for a Team source. Players are picked from the team's current ESPN roster,
// loaded as the league and team code are filled in, instead of typed by name.

import { useEffect, useState } from "react";
import { Sheet } from "@/components/FormSheet";
import type { SourceInput, WatchSource } from "@/lib/watch/data";
import type { TeamConfig } from "@/lib/watch/types";
import { LEAGUES } from "./SourceForm";

const TEAM_CODE = /^[a-z0-9]{2,6}$/i;

/** Roster names for a league and team code: null while loading, "failed" if ESPN didn't answer. */
function useRoster(league: string, team: string) {
  const [names, setNames] = useState<string[] | null | "failed">(null);
  useEffect(() => {
    setNames(null);
    if (!TEAM_CODE.test(team)) return;
    let live = true;
    // Waits for typing to settle before asking.
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ sport: LEAGUES[league], league, team: team.toLowerCase() });
        const res = await fetch(`/api/watch/roster?${q}`);
        const body = res.ok ? ((await res.json()) as { players: string[] }) : null;
        if (live) setNames(body ? body.players : "failed");
      } catch {
        if (live) setNames("failed");
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [league, team]);
  return names;
}

export function TeamForm({
  source, onSubmit, onClose, onDelete,
}: {
  source: Pick<WatchSource, "title" | "config" | "enabled" | "everyMinutes"> & { id?: string };
  onSubmit: (v: SourceInput) => void;
  onClose: () => void;
  /** Deletes the source for good; offered only when editing an existing one. */
  onDelete?: () => void;
}) {
  const c = source.config as unknown as TeamConfig;
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(source.title);
  const [league, setLeague] = useState(c.league);
  const [team, setTeam] = useState(c.team);
  const [every, setEvery] = useState(String(source.everyMinutes));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(c.players ?? []));
  const [enabled, setEnabled] = useState(source.enabled);
  const [error, setError] = useState<string | null>(null);
  const roster = useRoster(league, team.trim());
  const names = Array.isArray(roster) ? roster : [];
  // Picked earlier but not on this roster (traded, or another team's code): kept visible so they can be turned off.
  const offRoster = Array.isArray(roster) ? [...picked].filter((n) => !names.includes(n)) : [...picked];

  const toggle = (n: string) => {
    const next = new Set(picked);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setPicked(next);
  };

  const save = () => {
    const minutes = Number(every);
    if (!title.trim()) return setError("Name is required.");
    if (!TEAM_CODE.test(team.trim())) return setError("Team is ESPN's short code, like por.");
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) return setError("Refresh every 15 to 1440 minutes.");
    const players = [...names.filter((n) => picked.has(n)), ...offRoster];
    onSubmit({
      title: title.trim(), enabled, everyMinutes: minutes,
      config: { ...c, league, sport: LEAGUES[league], team: team.trim().toLowerCase(), players },
    });
  };

  const row = (n: string) => (
    <div key={n} className="row">
      <span className="row-label">{n}</span>
      <button type="button" role="switch" className="switch" aria-checked={picked.has(n)} aria-label={`Follow ${n}`} onClick={() => toggle(n)} />
    </div>
  );

  if (deleting) {
    return (
      <Sheet title={`Delete ${source.title}?`} onClose={onClose}>
        <div className="cal-form">
          <p className="muted" style={{ margin: 0 }}>
            This removes the team, its followed players and its saved stats for good. To keep it but take it off Watch, turn off &ldquo;Show on
            Watch&rdquo; instead.
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setDeleting(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ background: "var(--danger)" }} onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={source.id ? `${source.title} settings` : "Add team"} onClose={onClose}>
      <div className="cal-form">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">League</span>
          <select className="input" value={league} onChange={(e) => setLeague(e.target.value)}>
            {Object.keys(LEAGUES).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Team (ESPN code, e.g. por)</span>
          <input className="input" value={team} autoCapitalize="none" onChange={(e) => setTeam(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Refresh every (min)</span>
          <input className="input num" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} />
        </label>

        <div className="section-title">
          <span className="label">Players to follow{picked.size ? ` (${picked.size})` : ""}</span>
          {names.length > 0 && (
            <span style={{ display: "flex", gap: "var(--s-2)" }}>
              <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set([...names, ...offRoster]))}>
                All
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())}>
                None
              </button>
            </span>
          )}
        </div>
        {!TEAM_CODE.test(team.trim()) ? (
          <p className="faint" style={{ margin: 0 }}>Enter a team code to see its roster.</p>
        ) : roster === null ? (
          <p className="faint" style={{ margin: 0 }}>Loading roster…</p>
        ) : roster === "failed" ? (
          <p className="watch-fallback">Couldn&rsquo;t load that roster. Check the league and team code.</p>
        ) : null}
        {(names.length > 0 || offRoster.length > 0) && (
          <div className="card list">
            {names.map(row)}
            {offRoster.length > 0 && (
              <>
                {names.length > 0 && <div className="group-head label">Not on this roster</div>}
                {offRoster.map(row)}
              </>
            )}
          </div>
        )}

        <div className="row">
          <span className="row-label">Show on Watch</span>
          <button type="button" role="switch" className="switch" aria-checked={enabled} aria-label="Show on Watch" onClick={() => setEnabled(!enabled)} />
        </div>
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>{error}</p>}
        <button type="button" className="btn btn-primary" onClick={save}>
          {source.id ? "Save" : "Add"}
        </button>
        {source.id && onDelete && (
          <button type="button" className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setDeleting(true)}>
            Delete team
          </button>
        )}
      </div>
    </Sheet>
  );
}
