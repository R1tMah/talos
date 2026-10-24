// Day math for the calendar, shared by the refresh job and the card: which events fall
// on which day, in the calendar's timezone (not the server's, which is UTC).

import type { CalEvent } from "./types";

/** "YYYY-MM-DD" for `now` in a timezone. */
export function dayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Midnight at the start of a "YYYY-MM-DD" day in a timezone, as an ISO instant. */
export function midnightIn(tz: string, day: string): string {
  // Guess UTC midnight, then correct by the zone's offset at that moment (twice, for DST edges).
  let t = Date.parse(`${day}T00:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:00Z`);
    t -= local - Date.parse(`${day}T00:00:00Z`);
  }
  return new Date(t).toISOString();
}

export const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** True when the event touches that day. All-day end dates are exclusive, as Google gives them. */
export function onDay(e: CalEvent, day: string, tz: string): boolean {
  if (e.allDay) return e.start <= day && day < e.end;
  return Date.parse(e.start) < Date.parse(midnightIn(tz, addDay(day, 1))) && Date.parse(e.end) > Date.parse(midnightIn(tz, day));
}

// ---- Event writes ------------------------------------------------------------------

/** An event as the owner fills it in: local date and times in the calendar's timezone. */
export interface EventInput {
  calendarId: string;
  title: string;
  allDay: boolean;
  date: string; // "YYYY-MM-DD", the first day
  lastDay?: string | null; // all-day only: the last day (inclusive); defaults to `date`
  start?: string | null; // timed only: "HH:MM"
  end?: string | null; // timed only: "HH:MM"; defaults to an hour after start; earlier than start = next day
  location?: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The Google Calendar body for an event, or what's wrong with it. Pure; checked before any write. */
export function eventBody(e: EventInput, tz: string): { body: Record<string, unknown> } | { error: string } {
  const title = e.title.trim();
  if (!title) return { error: "The event needs a title." };
  if (title.length > 300) return { error: "That title is too long." };
  if (!DAY.test(e.date)) return { error: "Pick a date." };
  const location = e.location?.trim() || null;
  if (e.allDay) {
    const last = e.lastDay || e.date;
    if (!DAY.test(last) || last < e.date) return { error: "The last day can't be before the first." };
    // Google's all-day end date is exclusive: the day after the last day.
    return { body: { summary: title, location, start: { date: e.date }, end: { date: addDay(last, 1) } } };
  }
  if (!e.start || !HHMM.test(e.start)) return { error: "Pick a start time." };
  let endDay = e.date;
  let end = e.end && HHMM.test(e.end) ? e.end : null;
  if (!end) {
    // No end: an hour, carried past midnight if it has to be.
    const m = mins(e.start) + 60;
    end = hhmm(m % 1440);
    if (m >= 1440) endDay = addDay(e.date, 1);
  } else if (mins(end) === mins(e.start)) {
    return { error: "The end time has to be after the start." };
  } else if (mins(end) < mins(e.start)) {
    endDay = addDay(e.date, 1); // 11 PM to 1 AM runs past midnight
  }
  return {
    body: {
      summary: title, location,
      start: { dateTime: `${e.date}T${e.start}:00`, timeZone: tz },
      end: { dateTime: `${endDay}T${end}:00`, timeZone: tz },
    },
  };
}

/** Local "YYYY-MM-DD" and "HH:MM" of an instant in a timezone. */
export function localParts(iso: string, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
