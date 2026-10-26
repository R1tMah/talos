"use client";

// Google Calendar on Watch: one card, two pages you swipe between, Today and This week.
// Events are shown as Google gave them (titles, times, calendar colors). The owner can
// add, edit and delete events here; nothing changes in Google until they press Save.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormSheet, Sheet, type Field } from "@/components/FormSheet";
import { IconChevron, IconPlus } from "@/components/Icons";
import { googleApi, loadSource, type GoogleStatus, type SourceInput, type WatchSource } from "@/lib/watch/data";
import { addDay, dayIn, eventBody, localParts, onDay } from "@/lib/watch/calendarDays";
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

function EventRow({ e, tz, now, onOpen }: { e: CalEvent; tz: string; now: Date; onOpen: (e: CalEvent) => void }) {
  const past = !e.allDay && Date.parse(e.end) <= now.getTime();
  const live = !e.allDay && Date.parse(e.start) <= now.getTime() && !past;
  return (
    <div className={`cal-event${past ? " past" : ""}${live ? " live" : ""}`}>
      <span className="cal-dot" style={e.color ? { background: e.color } : undefined} />
      <span className="cal-time num">{e.allDay ? "All day" : timeIn(e.start, tz)}</span>
      <button type="button" className="cal-main" onClick={() => onOpen(e)} aria-label={`Edit ${e.title}`}>
        <span className="cal-title">{e.title}</span>
        {(e.location || live) && (
          <span className="cal-sub">
            {live && <b>Now · until {timeIn(e.end, tz)}</b>}
            {live && e.location && " · "}
            {e.location}
          </span>
        )}
      </button>
      <a href={e.link} {...linkOut} className="cal-out" aria-label={`Open ${e.title} in Google Calendar`}>↗</a>
    </div>
  );
}

function DayList({ events, empty, tz, now, onOpen }: { events: CalEvent[]; empty: string; tz: string; now: Date; onOpen: (e: CalEvent) => void }) {
  if (!events.length) return <p className="faint cal-empty">{empty}</p>;
  return <div className="cal-list">{events.map((e) => <EventRow key={e.id} e={e} tz={tz} now={now} onOpen={onOpen} />)}</div>;
}

export function CalendarCard({ s: initial, full }: { s: WatchSource; full?: boolean }) {
  // After an add/edit/delete the server refetches; the card then re-reads its own source.
  const [fresh, setFresh] = useState<WatchSource | null>(null);
  const s = fresh ?? initial;
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        <div className="cal-head-right">
          <div className="cal-tabs" role="tablist" aria-label="Calendar view">
            {["Today", "Week"].map((label, i) => (
              <button key={label} type="button" role="tab" aria-selected={page === i} onClick={() => go(i)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="Add event" onClick={() => setEditing("new")}>
            <IconPlus size={18} />
          </button>
        </div>
      </div>
      <Fallback s={s} />
      {notice && <p role="alert" className="watch-fallback">{notice}</p>}
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
            <DayList events={events.filter((e) => onDay(e, today, tz))} empty="Nothing on the calendar today." tz={tz} now={now} onOpen={setEditing} />
          </div>
          <div className="cal-page" aria-label="This week">
            {week.map((d) => {
              const on = events.filter((e) => onDay(e, d, tz));
              return (
                <div key={d} className="cal-week-day">
                  <span className="cal-day-label">{d === today ? `Today · ${dayLabel(d)}` : dayLabel(d)}</span>
                  <DayList events={on} empty="Nothing." tz={tz} now={now} onOpen={setEditing} />
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
      {editing && (
        <EventSheet
          s={s}
          tz={tz}
          today={today}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={async (message) => {
            setEditing(null);
            setNotice(message);
            const next = await loadSource(s.id);
            if (next) setFresh(next);
          }}
        />
      )}
    </section>
  );
}

// ---- Add / edit an event ---------------------------------------------------------------------

type Values = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();

/** Form values for an event, in the calendar's own timezone. */
function valuesOf(e: CalEvent | null, today: string, tz: string, calName: string): Values {
  if (!e) return { title: "", calendar: calName, allDay: false, date: today, start: "", end: "", lastDay: "", location: "" };
  if (e.allDay) {
    return { title: e.untitled ? "" : e.title, allDay: true, date: e.start, lastDay: addDay(e.end, -1), start: "", end: "", location: e.location ?? "" };
  }
  const a = localParts(e.start, tz), b = localParts(e.end, tz);
  return { title: e.untitled ? "" : e.title, allDay: false, date: a.date, start: a.time, end: b.date === a.date || b.date === addDay(a.date, 1) ? b.time : "", lastDay: "", location: e.location ?? "" };
}

/**
 * The add/edit sheet. Checks Google first: the connection must allow writing (older
 * connections were read-only) and the calendar must be one the owner can write to.
 */
function EventSheet({
  s, tz, today, event, onClose, onDone,
}: {
  s: WatchSource;
  tz: string;
  today: string;
  event: CalEvent | null;
  onClose: () => void;
  onDone: (notice: string | null) => void;
}) {
  const [status, setStatus] = useState<GoogleStatus | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Deleting a repeating event first asks which occurrences, like Google Calendar does.
  const [askScope, setAskScope] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    googleApi.status().then(setStatus);
  }, []);
  const back = `/watch/${s.id}`;

  const reconnect = (
    <Sheet title={event ? "Edit event" : "Add event"} onClose={onClose}>
      <div className="cal-form">
        <p className="muted" style={{ margin: 0 }}>
          Your Google connection is read-only. Reconnect once to let Talos add and change events.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => googleApi.connect(back)}>
          Reconnect Google Calendar
        </button>
      </div>
    </Sheet>
  );

  if (status === undefined) return <Sheet title={event ? "Edit event" : "Add event"} onClose={onClose}><p className="faint">Checking Google…</p></Sheet>;
  if (!status?.connected) {
    return (
      <Sheet title={event ? "Edit event" : "Add event"} onClose={onClose}>
        <p className="watch-fallback">{status ? "Google Calendar isn't connected. Connect it in this calendar's settings." : "Couldn't reach the server."}</p>
      </Sheet>
    );
  }
  if (!status.canWrite || error === "reconnect") return reconnect;

  // Calendars to add to: the ones shown on this card that the owner can write to, primary first.
  const shown = new Set((s.config as unknown as CalendarConfig).calendars.map((c) => c.id));
  const writable = status.calendars.filter((c) => c.writable && shown.has(c.id));
  if (!event && !writable.length) {
    return (
      <Sheet title="Add event" onClose={onClose}>
        <p className="watch-fallback">None of the calendars on this card can be written to. Pick one you own in the calendar&rsquo;s settings.</p>
      </Sheet>
    );
  }
  const byName = new Map(writable.map((c) => [c.name, c.id]));
  const fields: Field[] = [
    { name: "title", label: "Title", type: "text", full: true },
    ...(event ? [] : [{ name: "calendar", label: "Calendar", type: "select", options: writable.map((c) => c.name), full: true } as Field]),
    { name: "allDay", label: "All day", type: "toggle" },
    { name: "date", label: "Date", type: "date" },
    { name: "start", label: "Starts", type: "time" },
    { name: "end", label: "Ends (blank = 1 hour)", type: "time" },
    { name: "lastDay", label: "Last day (all-day, optional)", type: "date" },
    { name: "location", label: "Location (optional)", type: "text", full: true },
  ];
  const inputOf = (v: Values) => ({
    calendarId: event ? event.calendarId : byName.get(str(v.calendar)) ?? writable[0].id,
    title: str(v.title), allDay: Boolean(v.allDay), date: str(v.date),
    lastDay: v.allDay ? str(v.lastDay) || null : null,
    start: v.allDay ? null : str(v.start) || null, end: v.allDay ? null : str(v.end) || null,
    location: str(v.location) || null,
  });

  const send = async (op: "create" | "update" | "delete", v: Values | null, scope?: "one" | "following" | "all") => {
    const r = await googleApi.event(op, {
      sourceId: s.id, eventId: event?.eventId,
      event: v ? inputOf(v) : { calendarId: event!.calendarId },
      ...(scope && scope !== "one" ? { scope, seriesId: event!.seriesId, start: event!.start, allDay: event!.allDay } : {}),
    });
    if ("error" in r) {
      if (r.reconnect) return setError("reconnect");
      return onDone(`Couldn't ${op === "create" ? "add" : op === "update" ? "save" : "delete"} the event: ${r.error}`);
    }
    onDone(null);
  };

  if (askScope && event) {
    const del = async (scope: "one" | "following" | "all") => {
      setBusy(true);
      await send("delete", null, scope);
      setBusy(false);
    };
    return (
      <Sheet title="Delete repeating event" onClose={() => setAskScope(false)}>
        <div className="cal-form">
          <p className="muted" style={{ margin: 0 }}>
            &ldquo;{event.title}&rdquo; repeats. Which do you want to delete?
          </p>
          <div className="card list" role="group" aria-label="Which occurrences to delete">
            {([
              ["one", "This event", "Just this one; the rest stay"],
              ["following", "This and following events", "This one and every one after it"],
              ["all", "All events", "Every occurrence, past and future"],
            ] as const).map(([scope, label, sub]) => (
              <button key={scope} type="button" className="row" disabled={busy} onClick={() => del(scope)}>
                <span>
                  <span className="row-label" style={{ color: "var(--danger)" }}>{label}</span>
                  <span className="cell-sub">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => setAskScope(false)}>
            Cancel
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <FormSheet
      title={event ? (event.recurring ? "Edit this occurrence" : "Edit event") : "Add event"}
      submitLabel={event ? "Save" : "Add"}
      fields={fields}
      initial={valuesOf(event, today, tz, writable[0]?.name ?? "")}
      validate={(v) => {
        const b = eventBody(inputOf(v), tz);
        return "error" in b ? b.error : null;
      }}
      onClose={onClose}
      confirm
      // A repeating event's delete asks its own question (which occurrences) instead of the generic confirm.
      confirmDelete={!event?.recurring}
      onDelete={event ? (event.recurring ? () => setAskScope(true) : () => send("delete", null)) : undefined}
      onSubmit={(v) => send(event ? "update" : "create", v)}
    />
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
