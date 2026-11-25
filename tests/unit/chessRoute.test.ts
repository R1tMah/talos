// /api/chess with the session and chess.com faked: which monthly archives it fetches for
// ?months=, what a missing or unreachable month does, and the cache per month count.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/server", () => ({ ownerDb: async () => ({}) }));

const game = (end: number) => ({
  url: `https://www.chess.com/game/live/${end}`, end_time: end, time_class: "blitz", rated: true, rules: "chess",
  white: { username: "ChessM12326", rating: 1800 + end, result: "win" },
  black: { username: "x", rating: 1700, result: "resigned" },
});

/** chess.com by URL: "stats", "2026/11" and so on; a number is that HTTP status. */
function fakeChessCom(answers: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace(/^.*\/player\/[^/]+\/(games\/)?/, "");
    calls.push(key);
    const a = answers[key];
    const queue = Array.isArray(a) ? a : [a];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === "number") return new Response("{}", { status: next });
    return new Response(JSON.stringify(next ?? { games: [] }), { status: 200 });
  }));
  return calls;
}

async function get(query = "") {
  const { GET } = await import("@/app/api/chess/route");
  return GET(new Request(`http://localhost/api/chess${query}`));
}

beforeEach(() => {
  vi.resetModules(); // a fresh module cache per test
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T15:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/chess ?months=", () => {
  it("fetches this month and last by default", async () => {
    const calls = fakeChessCom({ stats: {}, "2026/11": { games: [game(3)] }, "2026/10": { games: [game(1)] } });
    const res = await get();
    expect(calls.sort()).toEqual(["2026/10", "2026/11", "stats"]);
    const body = await res.json();
    expect(body.months).toBe(2);
    expect(body.games.map((g: { end: number }) => g.end)).toEqual([1, 3]);
  });

  it("fetches the last N archives across a year, a missing (404) month being empty", async () => {
    const calls = fakeChessCom({ stats: {}, "2026/11": { games: [game(5)] }, "2026/01": 404, "2025/12": { games: [game(2)] } });
    const res = await get("?months=12");
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c !== "stats").sort()).toEqual([
      "2025/12", "2026/01", "2026/02", "2026/03", "2026/04", "2026/05", "2026/06", "2026/07", "2026/08", "2026/09", "2026/10", "2026/11",
    ]);
    const body = await res.json();
    expect(body.months).toBe(12);
    expect(body.games.map((g: { end: number }) => g.end)).toEqual([2, 5]);
  });

  it("retries an unreachable month once, and fails rather than show it as empty", async () => {
    fakeChessCom({ stats: {}, "2026/09": [429, { games: [game(7)] }] });
    const ok = await get("?months=3");
    expect((await ok.json()).games.map((g: { end: number }) => g.end)).toEqual([7]);

    vi.resetModules();
    fakeChessCom({ stats: {}, "2026/09": [429, 503] });
    const failed = await get("?months=3");
    expect(failed.status).toBe(502);
  });

  it("caches per month count, and each month's archive across counts", async () => {
    const calls = fakeChessCom({ stats: {} });
    await get();
    await get();
    expect(calls).toHaveLength(3); // the second came from the cache
    await get("?months=4");
    expect(calls.slice(3).sort()).toEqual(["2026/08", "2026/09", "stats"]); // only the months not fetched yet
    await get("?months=5");
    expect(calls.slice(6).sort()).toEqual(["2026/07", "stats"]); // a week further back: one more archive
    await get("?months=5&refresh");
    expect(calls.slice(8).sort()).toEqual(["2026/10", "2026/11", "stats"]); // refresh refetches the live months
    vi.setSystemTime(new Date("2026-11-25T22:00:00Z")); // 7 hours on: finished months are refetched too
    await get("?months=3");
    expect(calls.slice(11).sort()).toEqual(["2026/09", "2026/10", "2026/11", "stats"]);
  });

  it("keeps a response fresh only as long as the live archives it reused", async () => {
    const calls = fakeChessCom({ stats: {} });
    await get(); // Home at t=0: this month and last
    vi.setSystemTime(new Date("2026-11-25T15:00:55Z"));
    await get("?months=3"); // Chess at 55 s reuses them
    vi.setSystemTime(new Date("2026-11-25T15:01:05Z"));
    calls.length = 0;
    await get("?months=3"); // 65 s after this month was fetched: fetched again
    expect(calls.sort()).toEqual(["2026/10", "2026/11", "stats"]);
  });

  it("shares an archive already being fetched", async () => {
    const calls = fakeChessCom({ stats: {} });
    await Promise.all([get(), get("?months=3")]);
    expect(calls.filter((c) => c === "2026/11")).toHaveLength(1);
  });
});
