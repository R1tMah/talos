"use client";

// Google Calendar on Watch: one card, two pages you swipe between, Today and This week.
// Events are copied as Google gave them (titles, times, calendar colors). Read-only.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/FormSheet";
import { IconChevron } from "@/components/Icons";
import { googleApi, type GoogleStatus, type SourceInput, type WatchSource } from "@/lib/watch/data";
import { addDay, dayIn, onDay } from "@/lib/watch/calendarDays";
import type { CalEvent, CalendarConfig, CalendarSnap } from "@/lib/watch/types";
import { Fallback } from "./Views";

const linkOut = { target: "_blank", rel: "noopener noreferrer" } as const;

const timeIn = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
/** "Fri, Oct 24" for a "YYYY-MM-DD" day (noon UTC keeps it on the right date everywhere). */
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/** Re-render every minute so "now" and past events stay right while the card is open. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function EventRow({ e, tz, now }: { e: CalEvent; tz: string; now: Date }) {
  const past = !e.allDay && Date.parse(e.end) <= now.getTime();
  const live = !e.allDay && Date.parse(e.start) <= now.getTime() && !past;
  return (
    <a href={e.link} {...linkOut} className={`cal-event${past ? " past" : ""}${live ? " live" : ""}`}>
      <span className="cal-dot" style={e.color ? { background: e.color } : undefined} />
      <span className="cal-time num">{e.allDay ? "All day" : timeIn(e.start, tz)}</span>
      <span className="cal-main">
        <span className="cal-title">{e.title}</span>
        {(e.location || live) && (
          <span className="cal-sub">
            {live && <b>Now · until {timeIn(e.end, tz)}</b>}
            {live && e.location && " · "}
            {e.location}
          </span>
        )}
      </span>
    </a>
  );
}

function DayList({ events, empty, tz, now }: { events: CalEvent[]; empty: string; tz: string; now: Date }) {
  if (!events.length) return <p className="faint cal-empty">{empty}</p>;
  return <div className="cal-list">{events.map((e) => <EventRow key={e.id} e={e} tz={tz} now={now} />)}</div>;
}

export function CalendarCard({ s, full }: { s: WatchSource; full?: boolean }) {
  const snap = s.data as CalendarSnap | null;
  const now = useMinute();
  const pages = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const tz = snap?.timezone ?? (s.config as unknown as CalendarConfig).timezone;
  const today = dayIn(tz, now);
  const week = Array.from({ length: snap?.days ?? 7 }, (_, i) => addDay(today, i));
  const events = snap?.events ?? [];

  const go = (i: number) => pages.current?.scrollTo({ left: i * pages.current.clientWidth, behavior: "smooth" });

  return (
    <section className="card watch-card">
      <div className="watch-head">
        {full ? <span /> : (
          <Link href={`/watch/${s.id}`} className="watch-title">
            <span className="label">{s.title}</span>
            <IconChevron size={14} />
          </Link>
        )}
        <div className="cal-tabs" role="tablist" aria-label="Calendar view">
          {["Today", "Week"].map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={page === i} onClick={() => go(i)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Fallback s={s} />
      {snap && (
        // Swipes here page between Today and Week instead of switching app tabs.
        <div
          ref={pages}
          className="cal-pages"
          data-no-swipe
          onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        >
          <div className="cal-page" aria-label="Today">
            <span className="cal-day-label">{dayLabel(today)}</span>
            <DayList events={events.filter((e) => onDay(e, today, tz))} empty="Nothing on the calendar today." tz={tz} now={now} />
          </div>
          <div className="cal-page" aria-label="This week">
            {week.map((d) => {
              const on = events.filter((e) => onDay(e, d, tz));
              return (
                <div key={d} className="cal-week-day">
                  <span className="cal-day-label">{d === today ? `Today · ${dayLabel(d)}` : dayLabel(d)}</span>
                  <DayList events={on} empty="Nothing." tz={tz} now={now} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {snap && (
        <div className="cal-dots" aria-hidden>
          <span className={page === 0 ? "on" : ""} />
          <span className={page === 1 ? "on" : ""} />
        </div>
      )}
    </section>
  );
}

// ---- Settings ------------------------------------------------------------------------------

/**
 * The calendar's settings: Google sign-in, then which calendars to show. Its own sheet
 * because the calendar list comes from Google, not from fixed fields.
 */
export function CalendarForm({
  source, onSubmit, onClose,
}: {
  source: Pick<WatchSource, "title" | "config" | "enabled" | "everyMinutes"> & { id?: string };
  onSubmit: (v: SourceInput) => void;
  onClose: () => void;
}) {
  const c = source.config as unknown as CalendarConfig;
  const [status, setStatus] = useState<GoogleStatus | null | undefined>(undefined);
  const [title, setTitle] = useState(source.title);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(c.calendars.map((x) => x.id)));
  const [enabled, setEnabled] = useState(source.enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    googleApi.status().then((st) => {
      setStatus(st);
      // A first setup starts with the primary calendar picked.
      if (st?.connected && !c.calendars.length) {
        const primary = st.calendars.find((x) => x.primary);
        if (primary) setPicked(new Set([primary.id]));
      }
    });
  }, [c.calendars.length]);

  // Back here after Google: the add flow reopens this form (see the Watch page).
  const back = source.id ? `/watch/${source.id}` : "/watch?add=calendar";

  const save = () => {
    if (!title.trim()) return setError("Name is required.");
    const calendars = (status?.calendars ?? []).filter((x) => picked.has(x.id)).map((x) => ({ id: x.id, name: x.name }));
    if (!calendars.length) return setError("Pick at least one calendar.");
    onSubmit({ title: title.trim(), enabled, everyMinutes: 15, config: { ...c, calendars } });
  };

  return (
    <Sheet title={source.id ? `${source.title} settings` : "Add calendar"} onClose={onClose}>
      <div className="cal-form">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {status === undefined && <p className="faint">Checking Google…</p>}
        {status === null && <p className="watch-fallback">Couldn&rsquo;t reach the server. Try again.</p>}
        {status && !status.configured && (
          <p className="watch-fallback">Google sign-in isn&rsquo;t set up on the server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
        )}
        {status?.configured && !status.connected && (
          <button type="button" className="btn btn-primary" onClick={() => googleApi.connect(back)}>
            Connect Google Calendar
          </button>
        )}
        {status?.connected && (
          <>
            <p className="faint" style={{ margin: 0, fontSize: "var(--t-sm)" }}>
              Connected as {status.email ?? "your Google account"} (read-only).{" "}
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  if (await googleApi.disconnect()) setStatus({ ...status, connected: false, calendars: [] });
                  else setError("Couldn't disconnect.");
                }}
              >
                Disconnect
              </button>
            </p>
            {status.error && <p className="watch-fallback">{status.error}</p>}
            <span className="label">Calendars</span>
            <div className="card list">
              {status.calendars.map((cal) => (
                <div key={cal.id} className="row">
                  <span className="cal-dot" style={cal.color ? { background: cal.color } : undefined} />
                  <span className="row-label">{cal.name}</span>
                  <button
                    type="button"
                    role="switch"
                    className="switch"
                    aria-checked={picked.has(cal.id)}
                    aria-label={`Show ${cal.name}`}
                    onClick={() => {
                      const next = new Set(picked);
                      if (next.has(cal.id)) next.delete(cal.id);
                      else next.add(cal.id);
                      setPicked(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="row">
          <span className="row-label">Show on Watch</span>
          <button type="button" role="switch" className="switch" aria-checked={enabled} aria-label="Show on Watch" onClick={() => setEnabled(!enabled)} />
        </div>
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>{error}</p>}
        <button type="button" className="btn btn-primary" disabled={!status?.connected} onClick={save}>
          {source.id ? "Save" : "Add"}
        </button>
      </div>
    </Sheet>
  );
}
