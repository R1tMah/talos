"use client";

// The weather card, on Watch and on its own page. It holds several places, the way
// Apple Weather does: swipe between them (the default first, from the stored snapshot;
// the others fetched live), hold one to delete it or make it the default, and + to
// search for any city, airport, address or landmark and add it.

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { IconPlus } from "@/components/Icons";
import { Tag } from "@/components/ui";
import { watchApi, type WatchSource } from "@/lib/watch/data";
import type { PlaceHit, WeatherConfig, WeatherDay, WeatherPlace, WeatherSnap } from "@/lib/watch/types";
import { deg, hourLabel, isNight, localClock, localHour, sky } from "./format";
import { CardHead, Fallback } from "./Views";
import { WeatherIcon } from "./WeatherIcon";

type Forecast = WeatherSnap | { error: string } | null; // null: loading

async function api<T>(params: Record<string, string>): Promise<T | { error: string }> {
  try {
    const res = await fetch(`/api/watch/weather?${new URLSearchParams(params)}`, { cache: "no-store" });
    return (await res.json()) as T | { error: string };
  } catch {
    return { error: "offline" };
  }
}

const keyOf = (p: { lat: number; lon: number }) => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
const forecastOf = (p: { place: string; lat: number; lon: number }) =>
  api<WeatherSnap>({ lat: String(p.lat), lon: String(p.lon), place: p.place });
const ready = (f: Forecast | undefined) => (f && !("error" in f) ? f : null);

// ---- One place's forecast ------------------------------------------------------------------

/** The week by day: sky, rain chance, and the low-to-high range on the week's own scale. */
function WeekWeather({ days, today }: { days: WeatherDay[]; today: string }) {
  const lo = Math.min(...days.map((d) => d.lo));
  const span = Math.max(1, Math.max(...days.map((d) => d.hi)) - lo);
  return (
    <div className="wx-week">
      {days.map((d) => (
        <div key={d.date} className="wx-day">
          <span className="wx-day-name">{d.date === today ? "Today" : weekday(d.date)}</span>
          <WeatherIcon code={d.code} size={20} />
          <span className="faint num wx-day-rain">{d.precip ? `${d.precip}%` : ""}</span>
          <span className="faint num wx-day-temp">{deg(d.lo)}</span>
          <span className="wx-range" aria-hidden>
            <span style={{ left: `${((d.lo - lo) / span) * 100}%`, right: `${100 - ((d.hi - lo) / span) * 100}%` }} />
          </span>
          <span className="num wx-day-temp">{deg(d.hi)}</span>
        </div>
      ))}
    </div>
  );
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });

/** The place's own timezone: the snapshot's when Open-Meteo worked it out ("auto"). */
const tzOf = (w: WeatherSnap, p: WeatherPlace) => w.timezone ?? (p.timezone && p.timezone !== "auto" ? p.timezone : "America/New_York");

/** Today (now, hi/lo, the hours) or the week. On the source's page: today, then the week. */
function PlaceForecast({ w, tz, full, view }: { w: WeatherSnap; tz: string; full?: boolean; view: "today" | "week" }) {
  const from = localHour(tz);
  const today = from.slice(0, 10);
  const hours = w.hours.filter((h) => h.at >= from).slice(0, full ? 24 : 12);
  // A stale snapshot's "now" is the forecast for this hour, not the reading from hours ago.
  const nowTemp = w.current.at.slice(0, 13) === from.slice(0, 13) ? w.current.temp : hours[0]?.temp ?? w.current.temp;
  const nowCode = hours[0]?.code ?? w.current.code;
  const night = (at: string) => isNight(at, w.today.sunrise, w.today.sunset);
  // Days from today on (a stale snapshot may start yesterday).
  const days = w.days?.filter((d) => d.date >= today) ?? [];

  if (view === "week" && !full && days.length) return <WeekWeather days={days} today={today} />;
  return (
    <>
      <div className="wx-now">
        <WeatherIcon code={nowCode} night={night(hours[0]?.at ?? w.current.at)} size={36} />
        <span className="wx-temp num">{deg(nowTemp)}</span>
        <span className="wx-side">
          <span>{sky(nowCode)}</span>
          <span className="faint num">
            H {deg(w.today.hi)} · L {deg(w.today.lo)}{w.today.precip != null ? ` · ${w.today.precip}% rain` : ""}
          </span>
        </span>
      </div>
      <div className="hours">
        {hours.map((h) => (
          <div key={h.at} className="hour">
            <span className="faint">{h.at === from ? "Now" : hourLabel(h.at)}</span>
            <WeatherIcon code={h.code} night={night(h.at)} size={20} />
            <b className="num">{deg(h.temp)}</b>
            <span className="faint num">{h.precip ? `${h.precip}%` : ""}</span>
          </div>
        ))}
      </div>
      {full && (
        <>
          <p className="faint watch-foot">
            Feels like {deg(w.current.feels)} at {localClock(w.current.at)} · sunrise {localClock(w.today.sunrise)} · sunset {localClock(w.today.sunset)}
          </p>
          {days.length > 0 && (
            <>
              <span className="label">This week</span>
              <WeekWeather days={days} today={today} />
            </>
          )}
        </>
      )}
    </>
  );
}

// ---- Holding a place -------------------------------------------------------------------------

/** Pointer handlers that call onHold after a still press of half a second. */
function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        stop();
        navigator.vibrate?.(10);
        onHold();
      }, 500);
    },
    // A swipe or scroll is not a hold.
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    // Right-click, and the long-press menu some phones show instead.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      stop();
      onHold();
    },
  };
}

function PlacePage({ label, isDefault, onHold, children }: { label: string; isDefault: boolean; onHold: () => void; children: React.ReactNode }) {
  const hold = useHold(onHold);
  return (
    <div className="cal-page wx-page" aria-label={label} {...hold}>
      <div className="wx-place-name">
        <b>{label}</b>
        {isDefault && <Tag tone="tag-accent">Default</Tag>}
      </div>
      {children}
    </div>
  );
}

// ---- Search ------------------------------------------------------------------------------------

/** Search for a place, then its forecast with Cancel / Add. */
function PlaceSearch({ near, saved, onCancel, onAdd }: {
  near: { lat: number; lon: number };
  saved: Set<string>;
  onCancel: () => void;
  onAdd: (hit: PlaceHit, snap: WeatherSnap) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ hit: PlaceHit; snap: Forecast } | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(0);

  // Search as you type, a beat after the last key; only the latest answer counts.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      asked.current++;
      setHits(null);
      setFailed(null);
      setSearching(false);
      return;
    }
    const n = ++asked.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await api<{ places: PlaceHit[] }>({ q: text, lat: String(near.lat), lon: String(near.lon) });
      if (n !== asked.current) return;
      setSearching(false);
      if ("error" in r) {
        setFailed(r.error);
        setHits(null);
      } else {
        setFailed(null);
        setHits(r.places);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, near.lat, near.lon]);

  const open = async (hit: PlaceHit) => {
    setPreview({ hit, snap: null });
    const r = await forecastOf({ place: hit.name, lat: hit.lat, lon: hit.lon });
    setPreview((p) => (p?.hit === hit ? { hit, snap: r } : p));
  };

  if (preview) {
    const { hit, snap } = preview;
    const w = ready(snap);
    return (
      <div className="wx-searching">
        <div className="wx-preview-bar">
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setPreview(null)}>
            Cancel
          </button>
          <span className="wx-preview-title">
            <b>{hit.name}</b>
            {hit.detail && <span className="faint">{hit.detail}</span>}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || !w}
            onClick={async () => {
              if (!w) return;
              setBusy(true);
              await onAdd(hit, w);
              setBusy(false);
            }}
          >
            {saved.has(keyOf(hit)) ? "Show" : "Add"}
          </button>
        </div>
        {w ? (
          <PlaceForecast w={w} tz={tzOf(w, { place: hit.name, lat: hit.lat, lon: hit.lon, timezone: "auto" })} view="today" />
        ) : (
          <p className={snap ? "watch-fallback" : "faint"} role={snap ? "alert" : undefined}>
            {snap && "error" in snap ? `Couldn't load the forecast: ${snap.error}` : "Loading forecast…"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="wx-searching">
      <div className="wx-search">
        <input
          className="input"
          type="search"
          placeholder="Search for a city, airport or address"
          aria-label="Search for a place"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && hits?.[0]) open(hits[0]);
          }}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
        />
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {q.trim().length >= 2 && (
        <div className="list wx-hits" aria-live="polite">
          {failed ? (
            <p className="watch-fallback">Search failed: {failed}</p>
          ) : hits && hits.length > 0 ? (
            hits.map((h) => (
              <button key={`${h.name}|${h.detail}|${h.lat}`} type="button" className="row wx-hit" onClick={() => open(h)}>
                <span className="row-label">
                  {h.name}
                  {h.detail && <span className="cell-sub">{h.detail}</span>}
                </span>
              </button>
            ))
          ) : (
            <p className="faint wx-search-note">{searching || !hits ? "Searching…" : "No results."}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- The card ----------------------------------------------------------------------------------

/**
 * The weather card. `onChanged` reloads the source after its places change (adding,
 * deleting, a new default); without it the card can't change them.
 */
export function WeatherCard({ s, full, onChanged }: { s: WatchSource; full?: boolean; onChanged?: () => Promise<void> }) {
  const config = s.config as unknown as WeatherConfig;
  const home: WeatherPlace = { place: config.place, lat: config.lat, lon: config.lon, timezone: config.timezone };
  const others = config.others ?? [];
  const places = [home, ...others];
  const savedKeys = new Set(places.map(keyOf));

  const [forecasts, setForecasts] = useState<Record<string, Forecast>>({});
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<"today" | "week">("today");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState<number | null>(null); // the held place's index
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pages = useRef<HTMLDivElement>(null);
  const want = useRef<string | null>(null); // a place to swipe to once it's in the list

  // The other places' forecasts, fetched live (the stored snapshot is the default's).
  const othersKey = others.map(keyOf).join("|");
  useEffect(() => {
    for (const p of others) {
      const k = keyOf(p);
      if (k in forecasts) continue;
      setForecasts((f) => ({ ...f, [k]: null }));
      forecastOf(p).then((r) => setForecasts((f) => ({ ...f, [k]: r })));
    }
    // othersKey stands in for `others`, a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey]);

  const go = (i: number, smooth = true) =>
    pages.current?.scrollTo({ left: i * pages.current.clientWidth, behavior: smooth ? "smooth" : "auto" });

  // After adding (or showing) a place, swipe to it.
  const placesKey = places.map(keyOf).join("|");
  useEffect(() => {
    if (!want.current) return;
    const i = places.findIndex((p) => keyOf(p) === want.current);
    if (i < 0) return;
    want.current = null;
    requestAnimationFrame(() => go(i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, searching]);

  const save = async (next: WeatherConfig, newDefault: boolean) => {
    setBusy(true);
    setNotice(null);
    const ok = await watchApi.save(s.id, { title: s.title, config: { ...next }, enabled: s.enabled, everyMinutes: s.everyMinutes });
    if (!ok) setNotice("Failed to save.");
    else {
      // A new default needs its own snapshot.
      if (newDefault) await watchApi.refresh(s.id);
      await onChanged?.();
    }
    setBusy(false);
    return ok;
  };

  const add = async (hit: PlaceHit, snap: WeatherSnap) => {
    const p: WeatherPlace = { place: hit.name, lat: hit.lat, lon: hit.lon, timezone: snap.timezone ?? "auto" };
    const k = keyOf(p);
    if (!savedKeys.has(k) && !(await save({ ...config, others: [...others, p] }, false))) return;
    setForecasts((f) => ({ ...f, [k]: snap }));
    want.current = k;
    setSearching(false);
  };

  const makeDefault = async (i: number) => {
    const p = places[i];
    if (await save({ ...config, ...p, others: places.filter((_, j) => j !== i) }, true)) {
      setMenu(null);
      go(0, false);
    }
  };

  const remove = async (i: number) => {
    const rest = places.filter((_, j) => j !== i);
    // Deleting the default makes the next place the default.
    const next: WeatherConfig = i === 0 ? { ...config, ...rest[0], others: rest.slice(1) } : { ...config, others: rest.slice(1) };
    if (await save(next, i === 0)) {
      setMenu(null);
      go(Math.max(0, Math.min(index, rest.length - 1)), false);
    }
  };

  const home_w = s.data as WeatherSnap | null;
  const snapAt = (i: number): Forecast | undefined => (i === 0 ? home_w : forecasts[keyOf(places[i])]);
  const shown = ready(snapAt(Math.min(index, places.length - 1)));
  const hasWeek = !full && !!shown?.days?.length;
  const canEdit = !!onChanged;

  return (
    <section className="card watch-card">
      <CardHead
        s={s}
        full={full}
        right={
          !searching && (
            <div className="cal-head-right">
              {hasWeek && (
                <div className="cal-tabs" role="tablist" aria-label="Weather view">
                  {(["today", "week"] as const).map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                      {v === "today" ? "Today" : "Week"}
                    </button>
                  ))}
                </div>
              )}
              {canEdit && (
                <button type="button" className="icon-btn" aria-label="Add a place" onClick={() => setSearching(true)}>
                  <IconPlus />
                </button>
              )}
            </div>
          )
        }
      />
      {notice && <p role="alert" className="watch-fallback">{notice}</p>}

      {searching ? (
        <PlaceSearch near={home} saved={savedKeys} onCancel={() => setSearching(false)} onAdd={add} />
      ) : (
        <>
          {/* Swipes here move between places instead of switching app tabs. */}
          <div
            ref={pages}
            className="cal-pages"
            data-no-swipe
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
          >
            {places.map((p, i) => {
              const f = snapAt(i);
              const w = ready(f);
              return (
                <PlacePage key={keyOf(p)} label={p.place} isDefault={i === 0 && places.length > 1} onHold={() => canEdit && setMenu(i)}>
                  {i === 0 && <Fallback s={s} />}
                  {w ? (
                    <PlaceForecast w={w} tz={tzOf(w, p)} full={full} view={view} />
                  ) : f && "error" in f ? (
                    <p className="watch-fallback">Couldn&rsquo;t load the forecast: {f.error}</p>
                  ) : i !== 0 ? (
                    <p className="faint">Loading forecast…</p>
                  ) : null}
                </PlacePage>
              );
            })}
          </div>
          {places.length > 1 && (
            <div className="wx-dots" role="tablist" aria-label="Places">
              {places.map((p, i) => (
                <button key={keyOf(p)} type="button" role="tab" aria-selected={i === index} aria-label={p.place} onClick={() => go(i)} />
              ))}
            </div>
          )}
        </>
      )}

      {menu != null && places[menu] && (
        <Sheet title={places[menu].place} onClose={() => setMenu(null)}>
          <div className="wx-menu">
            {menu !== 0 && (
              <button type="button" className="btn btn-block" disabled={busy} onClick={() => makeDefault(menu)}>
                Make default
              </button>
            )}
            {places.length > 1 ? (
              <button type="button" className="btn btn-block btn-danger" disabled={busy} onClick={() => remove(menu)}>
                Delete
              </button>
            ) : (
              <p className="faint">This is the card&rsquo;s only place. Add another with + before deleting it.</p>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}
