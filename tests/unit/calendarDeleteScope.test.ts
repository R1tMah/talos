// The Watch event route's delete scopes for repeating events: just this one, this and
// following, or all of them.

import { beforeEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/agent/server", () => ({ ownerDb: async () => ({}) }));
vi.mock("@/lib/watch/refresh", () => ({ refreshWatch: async () => [] }));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "src", kind: "calendar", config: { timezone: "America/New_York" } } }) }) }) }),
  }),
}));
vi.mock("@/lib/google/calendar", async (orig) => ({
  ...(await orig<typeof import("@/lib/google/calendar")>()),
  listCalendars: async () => [{ id: "primary", writable: true }],
  deleteEvent: async (_a: unknown, cal: string, id: string) => void g.calls.push(`delete ${cal} ${id}`),
  deleteFollowing: async (_a: unknown, cal: string, id: string, start: string, allDay: boolean) =>
    void g.calls.push(`following ${cal} ${id} ${start} ${allDay}`),
}));

const { DELETE } = await import("@/app/api/google/events/route");
const del = (extra: Record<string, unknown>) =>
  DELETE(new Request("http://x/api/google/events", {
    method: "DELETE",
    body: JSON.stringify({ sourceId: "src", eventId: "s1_20261031T210000Z", event: { calendarId: "primary" }, ...extra }),
  }));

beforeEach(() => (g.calls = []));

describe("deleting a repeating event from Watch", () => {
  it("default and 'one' delete just that occurrence", async () => {
    expect((await del({})).status).toBe(200);
    expect((await del({ scope: "one" })).status).toBe(200);
    expect(g.calls).toEqual(["delete primary s1_20261031T210000Z", "delete primary s1_20261031T210000Z"]);
  });
  it("'all' deletes the series (from the card's seriesId, or worked out from the occurrence id)", async () => {
    await del({ scope: "all", seriesId: "s1" });
    await del({ scope: "all" });
    expect(g.calls).toEqual(["delete primary s1", "delete primary s1"]);
  });
  it("'following' cuts the series off at that occurrence", async () => {
    await del({ scope: "following", seriesId: "s1", start: "2026-10-31T17:00:00-04:00", allDay: false });
    expect(g.calls).toEqual(["following primary s1 2026-10-31T17:00:00-04:00 false"]);
  });
  it("refuses an unknown scope, a following without a start, and an odd series id", async () => {
    expect((await del({ scope: "everything" })).status).toBe(400);
    expect((await del({ scope: "following", seriesId: "s1" })).status).toBe(400);
    expect((await del({ scope: "all", seriesId: "../x" })).status).toBe(400);
    expect(g.calls).toEqual([]);
  });
});
