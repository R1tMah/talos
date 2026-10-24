// Calendar writes: the event body sent to Google, times read from chat, and the chat tool's checks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { run } from "@/lib/agent/run";
import { clockFrom } from "@/lib/agent/tools";
import { createEvent, deleteEvent, NeedsWriteAccess, updateEvent } from "@/lib/google/calendar";
import { eventBody } from "@/lib/watch/calendarDays";
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

describe("add_event in chat", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, input: Record<string, unknown>) => {
    model.toolCalls({ name: "add_event", input: { location: null, end_text: null, confidence: 0.95, ...input } });
    const f = fakeDb();
    return { ...(await run(ctxFor(text, f.db), 0.85, proposals().propose)), writes: f.writes() };
  };

  it("always asks before adding, and writes nothing yet", async () => {
    const r = await send("dinner with Sam tomorrow 7-9pm at Tatte", {
      title: "dinner with Sam", date_text: "tomorrow", start_text: "7", end_text: "9pm", location: "Tatte",
    });
    expect(r.cards[0]).toMatchObject({ kind: "warning" });
    expect((r.cards[0] as { detail: string }).detail).toBe("Add “dinner with Sam” to your Google Calendar on Oct 12, 7:00 PM–9:00 PM, at Tatte?");
    expect(r.writes).toEqual([]);
  });
  it("no time is an all-day event", async () => {
    const r = await send("flight to SF Nov 3", { title: "flight to SF", date_text: "Nov 3", start_text: null });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/Nov 3, all day\?$/);
  });
  it("no date asks for one", async () => {
    const r = await send("haircut 4pm", { title: "haircut", date_text: null, start_text: "4pm" });
    expect(r.cards[0]).toMatchObject({ kind: "missing", missing: [{ name: "date", type: "date" }] });
  });
  it("a bare hour asks for the time rather than guessing am/pm", async () => {
    const r = await send("call mom friday at 3", { title: "call mom", date_text: "friday", start_text: "3" });
    expect(r.cards[0]).toMatchObject({ kind: "missing", missing: [{ name: "start", type: "time" }] });
  });
  it("a reworded title falls back to what the model wrote, shown for confirming", async () => {
    const r = await send("dentist fri 3pm", { title: "Dentist appointment", date_text: "fri", start_text: "3pm" });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/^Add “Dentist appointment”/);
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
  it("a bad event never reaches Google", async () => {
    const calls = stub(() => new Response("{}"));
    await expect(createEvent(admin, NY, { ...base, title: "" })).rejects.toThrow(/title/);
    expect(calls).toEqual([]);
  });
});
