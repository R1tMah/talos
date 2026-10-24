"use client";

// One compact card (Watch screen) and one full view (the source's own page) per kind.
// Everything shown is copied from the stored snapshot; nothing is rewritten here.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Tag } from "@/components/ui";
import { IconChevron } from "@/components/Icons";
import { isStale, watchApi, type WatchSource } from "@/lib/watch/data";
import { fallbackLink, type Game, type PlayerSnap, type NewsSnap, type TeamSnap, type TransitConfig, type TransitSnap, type WeatherSnap } from "@/lib/watch/types";
import { CalendarCard } from "./Calendar";
import { NewsletterCard } from "./Newsletter";
import { ago, clock, dayClock, deg, hostOf, hourLabel, localClock, localHour, shortDate, sky } from "./format";

const linkOut = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Where a source falls back to: the snapshot's own link, else the default for its kind. */
const originalOf = (s: WatchSource) => (s.data as { link?: string } | null)?.link ?? fallbackLink(s.kind, s.config);

// ---- Shared pieces ------------------------------------------------------------------------

function CardHead({ s, right, full }: { s: WatchSource; right?: React.ReactNode; full?: boolean }) {
  // On the source's own page the screen header already names it.
  if (full) return right ? <div className="watch-head"><span />{right}</div> : null;
  return (
    <div className="watch-head">
      <Link href={`/watch/${s.id}`} className="watch-title">
        <span className="label">{s.title}</span>
        <IconChevron size={14} />
      </Link>
      {right}
    </div>
  );
}

/** Shown instead of (or above) a snapshot that couldn't be refreshed. */
export function Fallback({ s }: { s: WatchSource }) {
  if (!s.error && !isStale(s)) return null;
  return (
    <p className="watch-fallback">
      {s.data ? `Not updated since ${ago(s.fetchedAt)}.` : "Couldn't load yet."}{" "}
      <a href={originalOf(s)} {...linkOut}>Open {hostOf(originalOf(s))}</a>
    </p>
  );
}

/** Footer on a source's page: when it last updated, and the original. */
export function SourceFooter({ s }: { s: WatchSource }) {
  if (s.kind === "transit") return null;
  return (
    <p className="watch-foot faint">
      Updated {ago(s.fetchedAt)}{s.error ? ` · last try failed: ${s.error}` : ""} ·{" "}
      <a href={originalOf(s)} {...linkOut}>{hostOf(originalOf(s))}</a>
    </p>
  );
}

// ---- Transit (live) --------------------------------------------------------------------------

/** Next departures for the commute leg that applies now. Polls while the card is on screen. */
export function TransitCard({ s, full }: { s: WatchSource; full?: boolean }) {
  const c = s.config as unknown as TransitConfig;
  const [flip, setFlip] = useState(false);
  const [snap, setSnap] = useState<TransitSnap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const r = await watchApi.transit(s.id, flip);
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setSnap(r);
    }
  }, [s.id, flip]);

  useEffect(() => {
    load();
    const every = Math.max(10, c.cache_seconds || 20) * 1000;
    const poll = setInterval(() => document.visibilityState === "visible" && load(), every);
    const clockTick = setInterval(() => tick((n) => n + 1), 15_000); // keep "in N min" honest between polls
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(poll);
      clearInterval(clockTick);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load, c.cache_seconds]);

  const mins = (at: string) => Math.max(0, Math.round((Date.parse(at) - Date.now()) / 60_000));
  const deps = snap?.departures.filter((d) => Date.parse(d.at) > Date.now() - 30_000) ?? [];

  return (
    <section className="card watch-card">
      <CardHead
        s={s}
        full={full}
        right={c.manual_flip_toggle && (
          <button type="button" className="btn btn-sm" aria-pressed={flip} onClick={() => setFlip(!flip)}>
            ⇄ {flip ? "Back" : "Flip"}
          </button>
        )}
      />
      {snap && (
        <div className="transit-leg">
          <b>{snap.label}</b>
          <span className="faint"> from {snap.board}</span>
        </div>
      )}
      {snap ? (
        deps.length ? (
          <div className="deps">
            {deps.map((d) => (
              <div key={d.at} className="dep">
                <span className="dep-mins num">{d.status && /board|arriv/i.test(d.status) ? d.status : mins(d.at) === 0 ? "Now" : `${mins(d.at)} min`}</span>
                <span className="faint num">{clock(d.at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted watch-empty">No departures predicted right now.</p>
        )
      ) : !error && <p className="faint watch-empty">Loading…</p>}
      {snap?.alerts.map((a) => (
        <p key={a.header} className={`transit-alert${a.severity >= 7 ? " severe" : ""}`}>{a.header}</p>
      ))}
      {error && (
        <p className="watch-fallback">
          Couldn't reach the MBTA ({error}). <a href={fallbackLink("transit", s.config)} {...linkOut}>Open mbta.com</a>
        </p>
      )}
      {full && snap && <p className="watch-foot faint">Live from the MBTA · checked {ago(snap.fetchedAt)}</p>}
    </section>
  );
}

// ---- Weather -------------------------------------------------------------------------------

export function WeatherCard({ s, full }: { s: WatchSource; full?: boolean }) {
  const w = s.data as WeatherSnap | null;
  const tz = (s.config.timezone as string) || "America/New_York";
  const from = localHour(tz);
  const hours = w?.hours.filter((h) => h.at >= from).slice(0, full ? 24 : 12) ?? [];
  // A stale snapshot's "now" is the forecast for this hour, not the reading from hours ago.
  const nowTemp = w && (w.current.at.slice(0, 13) === from.slice(0, 13) ? w.current.temp : hours[0]?.temp ?? w.current.temp);
  return (
    <section className="card watch-card">
      <CardHead s={s} full={full} right={w && <span className="faint">{w.place}</span>} />
      <Fallback s={s} />
      {w && (
        <>
          <div className="wx-now">
            <span className="wx-temp num">{deg(nowTemp!)}</span>
            <span className="wx-side">
              <span>{sky(hours[0]?.code ?? w.current.code)}</span>
              <span className="faint num">
                H {deg(w.today.hi)} · L {deg(w.today.lo)}{w.today.precip != null ? ` · ${w.today.precip}% rain` : ""}
              </span>
            </span>
          </div>
          <div className="hours">
            {hours.map((h) => (
              <div key={h.at} className="hour">
                <span className="faint">{h.at === from ? "Now" : hourLabel(h.at)}</span>
                <b className="num">{deg(h.temp)}</b>
                <span className="faint num">{h.precip ? `${h.precip}%` : ""}</span>
              </div>
            ))}
          </div>
          {full && (
            <p className="faint watch-foot">
              Feels like {deg(w.current.feels)} at {localClock(w.current.at)} · sunrise {localClock(w.today.sunrise)} · sunset {localClock(w.today.sunset)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---- Team ----------------------------------------------------------------------------------

const vs = (g: Game) => `${g.home ? "vs" : "@"} ${g.opp}`;
const result = (g: Game) =>
  g.us == null || g.them == null ? g.detail : `${g.state === "post" ? (g.us > g.them ? "W" : "L") : ""} ${g.us}-${g.them}`.trim();

export function TeamCard({ s }: { s: WatchSource }) {
  const t = s.data as TeamSnap | null;
  const last = t?.recent[0];
  const next = t?.upcoming[0];
  return (
    <section className="card watch-card">
      <CardHead s={s} right={t?.record && <span className="num">{t.record}</span>} />
      <Fallback s={s} />
      {t && (
        <div className="watch-lines">
          {t.standing && <div className="muted">{t.standing}{t.streak ? ` · ${t.streak}` : ""}</div>}
          {next && (
            <div className="watch-line">
              <span>{next.state === "in" ? <Tag tone="tag-accent">Live</Tag> : "Next"} {vs(next)}</span>
              <span className="faint num">{next.state === "in" ? result(next) + " · " + next.detail : dayClock(next.date)}</span>
            </div>
          )}
          {last && (
            <div className="watch-line">
              <span>Last {vs(last)}</span>
              <span className="faint num">{result(last)}</span>
            </div>
          )}
          {t.players?.map((p) => (
            <div key={p.name} className="watch-line">
              <span>{p.short}</span>
              <span className="faint num">
                {p.season ? `${p.season.PTS} pts · ${p.season.REB} reb · ${p.season.AST} ast · ${p.season.GP} GP` : "No games yet"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function TeamView({ s }: { s: WatchSource }) {
  const t = s.data as TeamSnap | null;
  if (!t) return null;
  const rows: [string, string | null][] = [
    ["Record", t.record], ["Standing", t.standing], ["Games back", t.gamesBehind], ["Streak", t.streak], ["Home", t.home], ["Road", t.road],
  ];
  return (
    <>
      <div className="card strip">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <span className="label">{k}</span>
            <span className="strip-value num">{v}</span>
          </div>
        ))}
      </div>
      {t.players?.map((p) => <PlayerStats key={p.name} p={p} />)}
      {t.missingPlayers?.length ? <p className="faint">Not on the roster: {t.missingPlayers.join(", ")}</p> : null}
      <GameList title="Upcoming" games={t.upcoming} when={(g) => (g.state === "in" ? g.detail : dayClock(g.date))} />
      <GameList title="Recent" games={t.recent} when={(g) => shortDate(g.date)} />
    </>
  );
}

// A player's season in three groups, each stat with its name spelled out.
const STAT_GROUPS: { title?: string; big?: boolean; stats: [key: string, label: string][] }[] = [
  { big: true, stats: [["PTS", "Points"], ["REB", "Rebounds"], ["AST", "Assists"], ["TO", "Turnovers"]] },
  { title: "Shooting", stats: [["FG%", "Field goal"], ["3P%", "Three point"], ["FT%", "Free throw"]] },
  { title: "Efficiency", stats: [["eFG%", "Effective FG"], ["TS%", "True shooting"], ["AST/TO", "Assist to TO"]] },
];

/** A followed player's averages and shooting efficiency this season. */
function PlayerStats({ p }: { p: PlayerSnap }) {
  const line = p.season;
  return (
    <section className="card watch-card">
      <div className="pstats-head">
        <span className="label">{p.name}</span>
        {line && <span className="faint num">{line.GP} {line.GP === "1" ? "game" : "games"}</span>}
      </div>
      {line ? (
        STAT_GROUPS.map((g, i) => (
          <div key={i} className="pstats-group">
            {g.title && <span className="pstats-title">{g.title}</span>}
            <div className={`pstats${g.big ? " big" : ""}`}>
              {g.stats.map(([k, label]) => {
                const v = line[k] ?? "–";
                const pct = k.endsWith("%") && v !== "–";
                return (
                  <div key={k}>
                    <span className="pstats-value num">
                      {v}
                      {pct && <small>%</small>}
                    </span>
                    <span className="pstats-label">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <p className="muted watch-empty">No games this season yet.</p>
      )}
    </section>
  );
}

function GameList({ title, games, when }: { title: string; games: Game[]; when: (g: Game) => string }) {
  if (!games.length) return null;
  return (
    <section className="card list">
      <div className="group-head label">{title}</div>
      {games.map((g) => (
        <div key={g.id} className="row">
          <span className="row-label">{vs(g)}</span>
          {g.state !== "pre" && <span className="num">{result(g)}</span>}
          <span className="row-value num">{when(g)}{g.state === "pre" && g.tv ? ` · ${g.tv}` : ""}</span>
        </div>
      ))}
    </section>
  );
}

// ---- Headlines (ESPN news, Hacker News, RSS) ------------------------------------------------

export function NewsCard({ s }: { s: WatchSource }) {
  const n = s.data as NewsSnap | null;
  return (
    <section className="card watch-card">
      <CardHead s={s} />
      <Fallback s={s} />
      {n && <Headlines items={n.items.slice(0, 3)} compact />}
    </section>
  );
}

export function Headlines({ items, compact }: { items: NewsSnap["items"]; compact?: boolean }) {
  if (!items.length) return <p className="muted watch-empty">No headlines.</p>;
  return (
    <ul className={`news${compact ? " compact" : ""}`}>
      {items.map((h) => (
        <li key={h.url}>
          <a href={h.url} {...linkOut}>{h.title}</a>
          <span className="faint">{[h.source, h.at ? ago(h.at) : null].filter(Boolean).join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- Jobs (card only; the full view is components/watch/Jobs.tsx) -----------------------

export function JobsCard({ s }: { s: WatchSource }) {
  const snap = s.data as { matched: number } | null;
  return (
    <section className="card watch-card">
      <CardHead s={s} />
      <Fallback s={s} />
      {snap && (
        <div className="watch-line">
          <span>
            <b className="num">{s.newCount ?? 0}</b> new {s.seenAt ? "since you marked them seen" : "in the last 3 days"}
          </span>
          <span className="faint num">{snap.matched} open</span>
        </div>
      )}
    </section>
  );
}

/** The compact card for any source on the Watch screen. */
export function WatchCard({ s }: { s: WatchSource }) {
  switch (s.kind) {
    case "transit": return <TransitCard s={s} />;
    case "weather": return <WeatherCard s={s} />;
    case "espn_team": return <TeamCard s={s} />;
    case "espn_news":
    case "headlines": return <NewsCard s={s} />;
    case "jobs": return <JobsCard s={s} />;
    case "newsletter": return <NewsletterCard s={s} />;
    case "calendar": return <CalendarCard s={s} />;
    default: return null;
  }
}

