// Undo for calendar events chat adds: the saved card remembers Google's event id, and
// the undo route deletes it (primary calendar only; already-deleted counts as undone).

import { beforeEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({
  created: [] as unknown[],
  deleted: [] as [string, string][],
  deleteError: null as Error | null,
  owner: true,
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }),
}));
vi.mock("@/lib/watch/refresh", () => ({ refreshWatch: async () => [] }));
vi.mock("@/lib/agent/server", () => ({ ownerDb: async () => (g.owner ? {} : null) }));
vi.mock("@/lib/google/calendar", () => ({
  NeedsWriteAccess: class extends Error {},
  createEvent: async (_a: unknown, _tz: string, e: unknown) => (g.created.push(e), { id: "evt123", link: "L" }),
  deleteEvent: async (_a: unknown, cal: string, id: string) => {
    if (g.deleteError) throw g.deleteError;
    g.deleted.push([cal, id]);
  },
}));

const { commitCard } = await import("@/lib/agent/run");
const { POST } = await import("@/app/api/google/events/undo/route");

const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { timezone: "America/New_York" } }) }) }) }) } as never;
const post = (body: unknown) => POST(new Request("http://x/api/google/events/undo", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  g.created = [];
  g.deleted = [];
  g.deleteError = null;
  g.owner = true;
});

describe("calendar Undo", () => {
  it("the saved card carries Google's event id, so it gets an Undo", async () => {
    const resolved = { title: "system design mock interview", date: "2026-10-31", start: "17:00", end: null, allDay: false, location: null, weekly: true, until: null, count: null };
    const cards = await commitCard("add_event", resolved, { db, archived: new Set() }, async () => "p1");
    expect(cards).toEqual([
      { kind: "saved", label: "Calendar: system design mock interview, Every Saturday, 5:00 PM", actionId: null, googleEvent: { calendarId: "primary", eventId: "evt123" } },
    ]);
    expect(g.created[0]).toMatchObject({ calendarId: "primary", weekly: { count: null } });
  });

  it("deletes the event from the primary calendar", async () => {
    const res = await post({ calendarId: "primary", eventId: "evt123" });
    expect(res.status).toBe(200);
    expect(g.deleted).toEqual([["primary", "evt123"]]);
  });

  it("an event already deleted in Google still counts as undone", async () => {
    g.deleteError = new Error("That event no longer exists in Google Calendar.");
    expect((await post({ calendarId: "primary", eventId: "evt123" })).status).toBe(200);
  });

  it("other failures are reported, not swallowed", async () => {
    g.deleteError = new Error("Google Calendar returned 500");
    const res = await post({ calendarId: "primary", eventId: "evt123" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Google Calendar returned 500" });
  });

  it("only the owner, only the primary calendar, only a plain event id", async () => {
    expect((await post({ calendarId: "work@x.com", eventId: "evt123" })).status).toBe(400);
    expect((await post({ calendarId: "primary", eventId: "../calendars/x" })).status).toBe(400);
    expect((await post({ calendarId: "primary" })).status).toBe(400);
    g.owner = false;
    expect((await post({ calendarId: "primary", eventId: "evt123" })).status).toBe(401);
    expect(g.deleted).toEqual([]);
  });
});
