// Calendar writes: the event body sent to Google, times read from chat, and the chat tool's checks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { run } from "@/lib/agent/run";
import { chainEventStarts, clockFrom, resolveTimes } from "@/lib/agent/tools";
import { createEvent, deleteEvent, deleteFollowing, NeedsWriteAccess, rulesUntil, seriesIdOf, updateEvent } from "@/lib/google/calendar";
import { eventBody, weeklyRule } from "@/lib/watch/calendarDays";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const NY = "America/New_York";
const base = { calendarId: "primary", title: "Dentist", allDay: false, date: "2026-10-24" };

describe("event body", () => {
  it("timed events carry local times and the timezone", () => {
    expect(eventBody({ ...base, start: "15:00", end: "16:30", location: " Tatte " }, NY)).toEqual({
      body: {
        summary: "Dentist", location: "Tatte",
        start: { dateTime: "2026-10-24T15:00:00", timeZone: NY }, end: { dateTime: "2026-10-24T16:30:00", timeZone: NY },
      },
    });
  });
  it("no end time means an hour, past midnight if needed", () => {
    expect(eventBody({ ...base, start: "23:30" }, NY)).toMatchObject({ body: { end: { dateTime: "2026-10-25T00:30:00" } } });
  });
  it("an end earlier than the start runs to the next day", () => {
    expect(eventBody({ ...base, start: "23:00", end: "01:00" }, NY)).toMatchObject({ body: { end: { dateTime: "2026-10-25T01:00:00" } } });
  });
  it("all-day end dates are exclusive, as Google wants", () => {
    expect(eventBody({ ...base, allDay: true }, NY)).toMatchObject({ body: { start: { date: "2026-10-24" }, end: { date: "2026-10-25" } } });
    expect(eventBody({ ...base, allDay: true, lastDay: "2026-10-26" }, NY)).toMatchObject({ body: { end: { date: "2026-10-27" } } });
  });
  it.each([
    [{ ...base, title: "  " }, "title"],
    [{ ...base, start: null }, "start time"],
    [{ ...base, start: "10:00", end: "10:00" }, "after the start"],
    [{ ...base, allDay: true, lastDay: "2026-10-20" }, "before the first"],
    [{ ...base, date: "fri" }, "date"],
  ])("refuses a bad event (%#: %s)", (e, msg) => {
    expect((eventBody(e, NY) as { error: string }).error).toMatch(new RegExp(msg, "i"));
  });
});

describe("times from chat", () => {
  it.each([
    ["3pm", null, "15:00"], ["3:30 pm", null, "15:30"], ["12pm", null, "12:00"], ["12am", null, "00:00"],
    ["noon", null, "12:00"], ["15:00", null, "15:00"], ["7", "pm", "19:00"], ["9 a.m.", null, "09:00"],
  ] as const)("%s -> %s", (t, mer, want) => expect(clockFrom(t, mer)).toBe(want));
  it.each(["3", "9:30", "13pm", "25:00"])("%s is not guessed", (t) => expect(clockFrom(t)).toBeNull());
});

describe("deleting repeating events", () => {
  it("finds the series id, from the snapshot or from Google's occurrence id", () => {
    expect(seriesIdOf({ eventId: "abc_20261031T210000Z", seriesId: "abc" })).toBe("abc");
    expect(seriesIdOf({ eventId: "abc_20261031T210000Z" })).toBe("abc");
    expect(seriesIdOf({ eventId: "abc_20261031" })).toBe("abc"); // all-day occurrence
    expect(seriesIdOf({ eventId: "plain" })).toBe("plain");
  });
  it("cuts a series off just before an occurrence, keeping EXDATEs", () => {
    expect(rulesUntil(["RRULE:FREQ=WEEKLY;BYDAY=SA"], "2026-10-31T17:00:00-04:00", false)).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261031T205959Z"]);
    expect(rulesUntil(["RRULE:FREQ=WEEKLY;UNTIL=20271231T000000Z;BYDAY=MO", "EXDATE:20261102"], "2026-11-09", true))
      .toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261108", "EXDATE:20261102"]);
  });
});

describe("weekly repeats sent to Google", () => {
  it("repeats on the start date's weekday, forever or a set number of times", () => {
    expect(weeklyRule("2026-10-31", null)).toBe("RRULE:FREQ=WEEKLY;BYDAY=SA");
    expect(weeklyRule("2026-10-26", 9)).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=9");
  });
  it("timed and all-day events carry the rule; one-offs don't", () => {
    const timed = eventBody({ ...base, date: "2026-10-31", start: "17:00", weekly: { count: null } }, "America/New_York");
    expect(timed).toMatchObject({ body: { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SA"], start: { dateTime: "2026-10-31T17:00:00" } } });
    const allDay = eventBody({ ...base, allDay: true, date: "2026-10-26", weekly: { count: 3 } }, "America/New_York");
    expect(allDay).toMatchObject({ body: { recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3"] } });
    const once = eventBody({ ...base, start: "17:00" }, "America/New_York");
    expect("body" in once && "recurrence" in once.body).toBe(false);
    expect(eventBody({ ...base, start: "17:00", weekly: { count: 0 } }, "America/New_York")).toEqual({ error: "The repeat count must be at least 1." });
  });
});

describe("reading times without am/pm", () => {
  const at = (start: string | null, end: string | null, opts: Parameters<typeof resolveTimes>[2] = {}) => {
    const r = resolveTimes(start, end, opts);
    return `${r.start ?? "-"}/${r.end ?? "-"}${r.bad.length ? ` bad:${r.bad}` : ""}`;
  };
  const today = (clock: string) => ({ today: true, clock });

  it.each([
    // written am/pm and 24-hour times are taken as they are
    ["3pm", null, {}, "15:00/-"], ["3:30 am", null, {}, "03:30/-"], ["15:00", "16:30", {}, "15:00/16:30"], ["noon", "1pm", {}, "12:00/13:00"],
    // the other end of a range decides
    ["7", "9pm", {}, "19:00/21:00"], ["11", "1pm", {}, "11:00/13:00"], ["9am", "11", {}, "09:00/11:00"], ["10pm", "1", {}, "22:00/01:00"],
    ["11:30", "12:30 pm", {}, "11:30/12:30"], ["6", "7am", {}, "06:00/07:00"],
    // today: the next time that reading comes round, from 90 minutes ago
    ["1:15", "1:45", today("12:54"), "13:15/13:45"], ["5:30", "8:30", today("12:54"), "17:30/20:30"], ["11", "1", today("09:00"), "11:00/13:00"],
    ["9", null, today("07:30"), "09:00/-"], ["9", null, today("10:00"), "09:00/-"], ["9", null, today("11:00"), "21:00/-"],
    ["12:30", null, today("10:00"), "12:30/-"], ["8", "9", today("20:15"), "20:00/21:00"], ["10", "11", today("23:00"), "22:00/23:00"],
    // the model's hint beats the clock and waking hours
    ["7", null, { hint: "pm" }, "19:00/-"], ["8", "9", { hint: "am", ...today("15:00") }, "08:00/09:00"],
    // in a range the hint decides the end; the start is the reading soonest before it
    ["11:30", "3", { hint: "pm" }, "11:30/15:00"], ["10", "11:30", { hint: "am" }, "10:00/11:30"], ["7", "9", { hint: "pm" }, "19:00/21:00"],
    ["9", "12", { hint: "am" }, "09:00/12:00"], ["12", null, { hint: "am" }, "12:00/-"], ["11", "1", { hint: "pm" }, "11:00/13:00"],
    [null, "3", { hint: "pm" }, "-/15:00"],
    // another day: waking hours
    ["8", null, {}, "08:00/-"], ["11", null, {}, "11:00/-"], ["12", null, {}, "12:00/-"], ["3", "4", {}, "15:00/16:00"], ["6:45", null, {}, "18:45/-"],
    // end only, and unreadable times
    [null, "2:15", today("12:54"), "-/14:15"], ["half past", null, {}, "-/- bad:start"], ["3pm", "later", {}, "15:00/- bad:end"],
  ] as const)("%s to %s with %o -> %s", (s, e, o, want) => expect(at(s, e, o as never)).toBe(want));

  it("an end-only event starts when the event just before it (same day) ended", () => {
    const ev = (start_text: string | null, end_text: string | null, date_text: string | null = null) =>
      ({ name: "add_event", input: { start_text, end_text, date_text } });
    const starts = (calls: ReturnType<typeof ev>[]) => chainEventStarts(calls).map((c) => c.input.start_text);
    expect(starts([ev("1:15", "1:45"), ev(null, "2:15"), ev(null, "3:30")])).toEqual(["1:15", "1:45", "2:15"]);
    // the event before has no end: nothing to chain from, even if an older one had
    expect(starts([ev("10", "11:30"), ev("12", null), ev(null, "3")])).toEqual(["10", "12", null]);
    // a different day doesn't chain; other tools in between don't break it
    expect(starts([ev("1", "2", "today"), ev(null, "4", "friday")])).toEqual(["1", null]);
    expect(chainEventStarts([{ name: "add_event", input: { start_text: "1", end_text: "2", date_text: null } }, { name: "log_food", input: {} },
      { name: "add_event", input: { start_text: null, end_text: "3", date_text: null } }]).map((c) => c.input.start_text)).toEqual(["1", undefined, "2"]);
  });

  it("an end never lands on the start", () => {
    expect(at("12", "12", {})).toBe("12:00/00:00");
  });
});

describe("add_event in chat", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, input: Record<string, unknown>, clock?: string) => {
    model.toolCalls({ name: "add_event", input: { location: null, end_text: null, am_pm: null, weekly: false, until_text: null, confidence: 0.95, ...input } });
    const f = fakeDb();
    return { ...(await run(ctxFor(text, f.db, clock ? { clock } : {}), 0.85, proposals().propose)), writes: f.writes() };
  };
  const detail = (r: { cards: unknown[] }, i = 0) => (r.cards[i] as { detail?: string }).detail;

  it("always asks before adding, and writes nothing yet", async () => {
    const r = await send("dinner with Sam tomorrow 7-9pm at Tatte", {
      title: "dinner with Sam", date_text: "tomorrow", start_text: "7", end_text: "9pm", location: "Tatte",
    });
    // A confirmation, not a "that doesn't look right" warning.
    expect(r.cards[0]).toMatchObject({ kind: "warning", title: "Add to Google Calendar?", action: "Add" });
    expect((r.cards[0] as { detail: string }).detail).toBe("“dinner with Sam”, Oct 12, 7:00 PM–9:00 PM, at Tatte");
    expect(r.writes).toEqual([]);
  });
  it("no time is an all-day event", async () => {
    const r = await send("flight to SF Nov 3", { title: "flight to SF", date_text: "Nov 3", start_text: null });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/Nov 3, all day$/);
  });
  it("no date means today", async () => {
    const r = await send("haircut 4pm", { title: "haircut", date_text: null, start_text: "4pm" });
    expect(detail(r)).toBe("“haircut”, Oct 11, 4:00 PM");
  });
  it("a date that was said but can't be read is asked, not assumed", async () => {
    const r = await send("haircut sometime next month at 4pm", { title: "haircut", date_text: "sometime next month", start_text: "4pm" });
    expect(r.cards[0]).toMatchObject({ kind: "missing", missing: [{ name: "date", label: 'Date ("sometime next month")' }] });
  });
  it("a bare hour on another day reads as waking hours (shown on the confirm card)", async () => {
    const r = await send("call mom friday at 3", { title: "call mom", date_text: "friday", start_text: "3" });
    expect(detail(r)).toMatch(/, 3:00 PM$/);
  });
  it("the model's am/pm hint settles a bare hour", async () => {
    const r = await send("dinner with Sam friday at 7", { title: "dinner with Sam", date_text: "friday", start_text: "7", am_pm: "pm" });
    expect(detail(r)).toMatch(/, 7:00 PM$/);
  });
  it("only an end time asks for the start instead of making an all-day event", async () => {
    const r = await send("eat until 2:15", { title: "eat", date_text: null, start_text: null, end_text: "2:15" });
    expect(r.cards[0]).toMatchObject({ kind: "missing", missing: [{ name: "start", label: "Start time" }] });
  });
  it("a weekly recurring event, said the owner's way", async () => {
    const r = await send("add a weekly recurring event on my calendar on saturday 5pm saying system design mock interview", {
      title: "system design mock interview", date_text: "saturday", start_text: "5pm", weekly: true,
    });
    expect(detail(r)).toBe("“system design mock interview”, every Saturday, starting Oct 17, 5:00 PM");
    expect(r.writes).toEqual([]);
  });
  it("a weekly event can stop on a date: the right number of weeks, inclusive", async () => {
    const store = proposals();
    model.toolCalls({ name: "add_event", input: {
      title: "system design mock interview", date_text: "saturday", start_text: "5pm", end_text: null, am_pm: null,
      weekly: true, until_text: "Dec 12", location: null, confidence: 0.95,
    } });
    const r = await run(ctxFor("weekly on saturday 5pm system design mock interview until Dec 12", fakeDb().db), 0.85, store.propose);
    expect(detail(r)).toBe("“system design mock interview”, every Saturday until Dec 12, starting Oct 17, 5:00 PM");
    // Oct 17 to Dec 12 is 8 weeks later: 9 Saturdays.
    expect([...store.stored.values()][0].resolved).toMatchObject({ weekly: true, until: "2026-12-12", count: 9 });
  });
  it("an end date before the start, or one that can't be read, is refused", async () => {
    let r = await send("weekly event friday 3pm standup until Oct 1", { title: "standup", date_text: "friday", start_text: "3pm", weekly: true, until_text: "Oct 1" });
    // "Oct 1" is past, so it reads as next year: that's after the start, so it's allowed.
    expect(detail(r)).toMatch(/every Friday until Oct 1, starting Oct 16/);
    r = await send("weekly event friday 3pm standup until whenever", { title: "standup", date_text: "friday", start_text: "3pm", weekly: true, until_text: "whenever" });
    expect(r.cards[0]).toMatchObject({ kind: "failed" });
  });
  it("the model alone can't make an event repeat: the owner's words have to say so", async () => {
    const r = await send("system design mock interview saturday 5pm", { title: "system design mock interview", date_text: "saturday", start_text: "5pm", weekly: true });
    expect(detail(r)).toBe("“system design mock interview”, Oct 17, 5:00 PM");
  });
  it("saying weekly without the model flag stays a one-off (no surprise repeats in multi-event messages)", async () => {
    const r = await send("weekly sync is moved; dentist friday 3pm", { title: "dentist", date_text: "friday", start_text: "3pm", weekly: false });
    expect(detail(r)).toBe("“dentist”, Oct 16, 3:00 PM");
  });
  it("the owner's afternoon plan: today, the next 1:15, chained and shared periods", async () => {
    const text = [
      "- From 1:15 to 1:45, go on a run.",
      "- Eat Chipotle until about 2:15.",
      "- I'm going to grab groceries and get home at around 3:30.",
      "- I will come back and start cooking from 4:30 to 5:30.",
      "- I'll also clean my room during that same period.",
      "- From 5:30 to 8:30, time is reserved for work and then dinner.",
    ].join("\n");
    // What the model is now told to send: chained starts copy the previous end; "that same period" copies its times.
    model.toolCalls(
      ...[
        ["go on a run", "1:15", "1:45"], ["Eat Chipotle", "1:45", "2:15"], ["grab groceries", "2:15", "3:30"],
        ["start cooking", "4:30", "5:30"], ["clean my room", "4:30", "5:30"], ["work and then dinner", "5:30", "8:30"],
      ].map(([title, start_text, end_text]) => ({
        name: "add_event", input: { title, date_text: null, start_text, end_text, am_pm: null, location: null, confidence: 0.9 },
      })),
    );
    const f = fakeDb();
    const r = await run(ctxFor(text, f.db, { clock: "12:54" }), 0.85, proposals().propose);
    expect(r.cards.map((c) => (c as { detail?: string }).detail)).toEqual([
      "“go on a run”, Oct 11, 1:15 PM–1:45 PM",
      "“Eat Chipotle”, Oct 11, 1:45 PM–2:15 PM",
      "“grab groceries”, Oct 11, 2:15 PM–3:30 PM",
      "“start cooking”, Oct 11, 4:30 PM–5:30 PM",
      "“clean my room”, Oct 11, 4:30 PM–5:30 PM",
      "“work and then dinner”, Oct 11, 5:30 PM–8:30 PM",
    ]);
    expect(f.writes()).toEqual([]);
  });
  it("a reworded title falls back to what the model wrote, shown for confirming", async () => {
    const r = await send("dentist fri 3pm", { title: "Dentist appointment", date_text: "fri", start_text: "3pm" });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/^“Dentist appointment”/);
  });
});

describe("writes to Google", () => {
  afterEach(() => vi.unstubAllGlobals());
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { refresh_token: "r" }, error: null }) }) }) }),
  } as never;
  const stub = (reply: (url: string, init: RequestInit) => Response) => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "a", expires_in: 3600, scope: "s" }));
      return reply(url, init);
    }));
    return calls;
  };

  it("creates, edits one occurrence, and deletes", async () => {
    const calls = stub((_, init) => (init.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ id: "e1", htmlLink: "L" }))));
    await expect(createEvent(admin, NY, { ...base, start: "15:00" })).resolves.toEqual({ id: "e1", link: "L" });
    await updateEvent(admin, NY, "e1_20261024T190000Z", { ...base, start: "16:00" });
    await deleteEvent(admin, "work@x.com", "e1");
    const api = calls.filter((c) => c.url.includes("/calendars/"));
    expect(api.map((c) => `${c.init.method} ${new URL(c.url).pathname}`)).toEqual([
      "POST /calendar/v3/calendars/primary/events",
      "PATCH /calendar/v3/calendars/primary/events/e1_20261024T190000Z",
      "DELETE /calendar/v3/calendars/work%40x.com/events/e1",
    ]);
    expect(JSON.parse(String(api[1].init.body)).start).toEqual({ dateTime: "2026-10-24T16:00:00", timeZone: NY });
  });
  it("a read-only grant asks the owner to reconnect", async () => {
    stub(() => new Response(JSON.stringify({ error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }), { status: 403 }));
    await expect(createEvent(admin, NY, { ...base, start: "15:00" })).rejects.toBeInstanceOf(NeedsWriteAccess);
  });
  it("this and following: the series stops a second before that occurrence", async () => {
    const calls = stub((_, init) =>
      init.method === "PATCH" ? new Response("{}") : new Response(JSON.stringify({
        id: "s1", htmlLink: "L", start: { dateTime: "2026-10-03T17:00:00-04:00" }, end: {},
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=20", "EXDATE;TZID=America/New_York:20261010T170000"],
      })),
    );
    await deleteFollowing(admin, "primary", "s1", "2026-10-31T17:00:00-04:00", false);
    const api = calls.filter((c) => c.url.includes("/calendars/"));
    expect(api.map((c) => `${c.init.method ?? "GET"} ${new URL(c.url).pathname}`)).toEqual([
      "GET /calendar/v3/calendars/primary/events/s1",
      "PATCH /calendar/v3/calendars/primary/events/s1",
    ]);
    expect(JSON.parse(String(api[1].init.body))).toEqual({
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261031T205959Z", "EXDATE;TZID=America/New_York:20261010T170000"],
    });
  });
  it("this and following from the first occurrence deletes the whole series", async () => {
    const calls = stub((_, init) =>
      init.method === "DELETE" ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ id: "s1", htmlLink: "L", start: { dateTime: "2026-10-31T17:00:00-04:00" }, end: {}, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=SA"] })),
    );
    await deleteFollowing(admin, "primary", "s1", "2026-10-31T17:00:00-04:00", false);
    expect(calls.filter((c) => c.url.includes("/calendars/")).map((c) => c.init.method ?? "GET")).toEqual(["GET", "DELETE"]);
  });
  it("a bad event never reaches Google", async () => {
    const calls = stub(() => new Response("{}"));
    await expect(createEvent(admin, NY, { ...base, title: "" })).rejects.toThrow(/title/);
    expect(calls).toEqual([]);
  });
});
