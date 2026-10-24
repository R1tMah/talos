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
