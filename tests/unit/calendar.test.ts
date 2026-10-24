// Google Calendar on Watch: which day events land on (in the calendar's timezone), and
// the fetch that merges the picked calendars into one snapshot.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCalendar } from "@/lib/google/calendar";
import { addDay, dayIn, midnightIn, onDay } from "@/lib/watch/calendarDays";
import type { CalEvent } from "@/lib/watch/types";

const NY = "America/New_York";

describe("days in the calendar's timezone", () => {
  it("today is the local date, not UTC's", () => {
    // 11:30 PM in New York is already the next day in UTC.
    expect(dayIn(NY, new Date("2026-10-24T03:30:00Z"))).toBe("2026-10-23");
  });
  it("midnight is local midnight, across DST changes", () => {
    expect(midnightIn(NY, "2026-10-23")).toBe("2026-10-23T04:00:00.000Z"); // EDT
    expect(midnightIn(NY, "2026-11-02")).toBe("2026-11-02T05:00:00.000Z"); // EST, after Nov 1
    expect(midnightIn(NY, "2026-03-09")).toBe("2026-03-09T04:00:00.000Z"); // EDT, after Mar 8
  });
  it("adds days by the calendar", () => {
    expect(addDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDay("2026-12-31", 7)).toBe("2027-01-07");
  });
});

const ev = (over: Partial<CalEvent>): CalEvent => ({
  id: "x", calendarId: "c", eventId: "x", title: "t", allDay: false, start: "", end: "", calendar: "Me", color: null, location: null, link: "", ...over,
});

describe("which day an event is on", () => {
  it("a timed event is on the local day it happens", () => {
    const late = ev({ start: "2026-10-23T23:00:00-04:00", end: "2026-10-23T23:30:00-04:00" });
    expect(onDay(late, "2026-10-23", NY)).toBe(true);
    expect(onDay(late, "2026-10-24", NY)).toBe(false);
  });
  it("an overnight event shows on both days", () => {
    const night = ev({ start: "2026-10-23T22:00:00-04:00", end: "2026-10-24T02:00:00-04:00" });
    expect(onDay(night, "2026-10-23", NY)).toBe(true);
    expect(onDay(night, "2026-10-24", NY)).toBe(true);
  });
  it("an event ending exactly at midnight doesn't spill into the next day", () => {
    const e = ev({ start: "2026-10-23T23:00:00-04:00", end: "2026-10-24T00:00:00-04:00" });
    expect(onDay(e, "2026-10-24", NY)).toBe(false);
  });
  it("all-day end dates are exclusive", () => {
    const trip = ev({ allDay: true, start: "2026-10-23", end: "2026-10-25" });
    expect(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => onDay(trip, d, NY))).toEqual([false, true, true, false]);
  });
});

describe("fetchCalendar", () => {
  afterEach(() => vi.unstubAllGlobals());

  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { refresh_token: "r" }, error: null }) }) }) }),
  } as never;

  it("merges the picked calendars, sorted, with all-day first, and drops cancelled events", async () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "a", expires_in: 3600, scope: "s" });
      if (url.includes("/users/me/calendarList")) {
        return json({ items: [{ id: "me@x.com", summary: "Me", backgroundColor: "#f00", primary: true }, { id: "work", summary: "Work", backgroundColor: "#00f" }] });
      }
      if (url.includes("/calendars/me%40x.com/events")) {
        return json({ items: [
          { id: "1", summary: "Dentist", htmlLink: "l1", start: { dateTime: "2026-10-23T15:00:00-04:00" }, end: { dateTime: "2026-10-23T16:00:00-04:00" } },
          { id: "2", summary: "Old", status: "cancelled", htmlLink: "l2", start: { dateTime: "2026-10-23T09:00:00-04:00" }, end: { dateTime: "2026-10-23T10:00:00-04:00" } },
          { id: "3", htmlLink: "l3", start: { date: "2026-10-23" }, end: { date: "2026-10-24" } },
        ] });
      }
      return json({ items: [{ id: "4", summary: "Standup", htmlLink: "l4", start: { dateTime: "2026-10-23T10:00:00-04:00" }, end: { dateTime: "2026-10-23T10:15:00-04:00" } }] });
    }));

    const snap = await fetchCalendar(admin, { calendars: [{ id: "me@x.com", name: "Me" }, { id: "work", name: "Work" }], timezone: NY, days: 7 },
      new Date("2026-10-23T12:00:00Z"));

    expect(snap.from).toBe("2026-10-23");
    expect(snap.events.map((e) => e.title)).toEqual(["(No title)", "Standup", "Dentist"]);
    expect(snap.events[1]).toMatchObject({ calendar: "Work", color: "#00f", allDay: false });
    // Asked Google for exactly today through 7 days, in local midnights.
    const q = new URL(calls.find((u) => u.includes("/events"))!).searchParams;
    expect(q.get("timeMin")).toBe("2026-10-23T04:00:00.000Z");
    expect(q.get("timeMax")).toBe("2026-10-30T04:00:00.000Z");
    expect(q.get("singleEvents")).toBe("true"); // recurring events expanded by Google
  });

  it("no calendars picked is an error the card can show", async () => {
    await expect(fetchCalendar(admin, { calendars: [], timezone: NY, days: 7 })).rejects.toThrow(/No calendars picked/);
  });
});
