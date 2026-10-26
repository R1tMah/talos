// Live stress test for calendar messages: real model (the API key in .env.local), real
// tool checks, no database or Google writes. Skipped unless LIVE=1 (it costs API calls):
//
//   npm run test:live
//
// Each case is a message and the events it should become once code has checked them.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LIVE = !!process.env.LIVE;
if (LIVE && existsSync(".env.local")) process.loadEnvFile(".env.local");

type Want = { title: string; date: string; start: string | null; end?: string | null; location?: string; weekly?: boolean; until?: string };
type Case = { text: string; clock: string; want: Want[] };

// Sunday, Oct 25 2026: tomorrow = 10-26, Thursday = 10-29, Friday = 10-30, Saturday = 10-31.
const TODAY = "2026-10-25";

const CASES: Case[] = [
  {
    text: [
      "- From 1:15 to 1:45, go on a run.",
      "- Eat Chipotle until about 2:15.",
      "- I'm going to grab groceries and get home at around 3:30.",
      "- I will come back and start cooking from 4:30 to 5:30.",
      "- I'll also clean my room during that same period.",
      "- From 5:30 to 8:30, time is reserved for work and then dinner.",
    ].join("\n"),
    clock: "12:54",
    want: [
      { title: "run", date: TODAY, start: "13:15", end: "13:45" },
      { title: "chipotle", date: TODAY, start: "13:45", end: "14:15" },
      { title: "groceries", date: TODAY, start: "14:15", end: "15:30" },
      { title: "cook", date: TODAY, start: "16:30", end: "17:30" },
      { title: "clean", date: TODAY, start: "16:30", end: "17:30" },
      { title: "work", date: TODAY, start: "17:30", end: "20:30" },
    ],
  },
  { text: "dentist friday 3pm", clock: "10:00", want: [{ title: "dentist", date: "2026-10-30", start: "15:00" }] },
  { text: "dinner with Sam at 7 at Tatte", clock: "11:00", want: [{ title: "dinner", date: TODAY, start: "19:00", location: "Tatte" }] },
  { text: "gym tomorrow 7 to 8am", clock: "21:00", want: [{ title: "gym", date: "2026-10-26", start: "07:00", end: "08:00" }] },
  { text: "team meeting 11-1", clock: "09:00", want: [{ title: "meeting", date: TODAY, start: "11:00", end: "13:00" }] },
  { text: "call mom tonight at 9", clock: "14:00", want: [{ title: "call mom", date: TODAY, start: "21:00" }] },
  { text: "breakfast with Alex at 8 tomorrow", clock: "22:00", want: [{ title: "breakfast", date: "2026-10-26", start: "08:00" }] },
  { text: "flight to SF Nov 3", clock: "10:00", want: [{ title: "flight", date: "2026-11-03", start: null }] },
  {
    text: "study 2-4 then gym 4:30-5:30",
    clock: "10:00",
    want: [{ title: "study", date: TODAY, start: "14:00", end: "16:00" }, { title: "gym", date: TODAY, start: "16:30", end: "17:30" }],
  },
  { text: "lunch at noon with Priya", clock: "09:00", want: [{ title: "lunch", date: TODAY, start: "12:00" }] },
  { text: "movie friday 10pm to 1am", clock: "12:00", want: [{ title: "movie", date: "2026-10-30", start: "22:00", end: "01:00" }] },
  { text: "haircut at 4", clock: "15:30", want: [{ title: "haircut", date: TODAY, start: "16:00" }] },
  { text: "interview with Google on 11/4 from 2 to 3", clock: "10:00", want: [{ title: "interview", date: "2026-11-04", start: "14:00", end: "15:00" }] },
  { text: "class 9 to 10:15 tomorrow morning", clock: "20:00", want: [{ title: "class", date: "2026-10-26", start: "09:00", end: "10:15" }] },
  { text: "pick up my package after work around 6", clock: "12:00", want: [{ title: "package", date: TODAY, start: "18:00" }] },
  { text: "coffee chat with Jordan Thursday 3:30-4", clock: "10:00", want: [{ title: "coffee", date: "2026-10-29", start: "15:30", end: "16:00" }] },
  { text: "concert Saturday at 8", clock: "10:00", want: [{ title: "concert", date: "2026-10-31", start: "20:00" }] },
  {
    text: "tomorrow: lecture 10 to 11:30, lunch with Maya at 12, then office hours until 3",
    clock: "21:00",
    want: [
      { title: "lecture", date: "2026-10-26", start: "10:00", end: "11:30" },
      { title: "lunch", date: "2026-10-26", start: "12:00" },
      { title: "office hours", date: "2026-10-26", start: null, end: "15:00" }, // start: whenever lunch ends; null or 13:00 both fine
    ],
  },
  { text: "pickleball 6-7 tonight", clock: "13:00", want: [{ title: "pickleball", date: TODAY, start: "18:00", end: "19:00" }] },
  {
    text: "I have a meeting from 3 to 4 and then a call with Dana at 4:30",
    clock: "10:00",
    want: [{ title: "meeting", date: TODAY, start: "15:00", end: "16:00" }, { title: "call", date: TODAY, start: "16:30" }],
  },
  { text: "date night at 8", clock: "12:00", want: [{ title: "date night", date: TODAY, start: "20:00" }] },
  { text: "doctor appointment Monday at 9:15am", clock: "12:00", want: [{ title: "doctor", date: "2026-10-26", start: "09:15" }] },
  {
    text: "add a weekly recurring event on my calendar on saturday 5pm saying system design mock interview",
    clock: "11:00",
    want: [{ title: "system design mock interview", date: "2026-10-31", start: "17:00", weekly: true }],
  },
  { text: "every Tuesday at 6:30pm I have lab meeting, add it to my calendar", clock: "11:00", want: [{ title: "lab meeting", date: "2026-10-27", start: "18:30", weekly: true }] },
  {
    text: "put a recurring event on thursdays from 3 to 4 for office hours until Dec 10",
    clock: "11:00",
    want: [{ title: "office hours", date: "2026-10-29", start: "15:00", end: "16:00", weekly: true, until: "2026-12-10" }],
  },
  { text: "system design mock interview saturday at 5pm", clock: "11:00", want: [{ title: "system design mock interview", date: "2026-10-31", start: "17:00", weekly: false }] },
  {
    text: "add a weekly recurring gym session on monday at 7am, and a one time dentist appointment friday at 3pm",
    clock: "11:00",
    want: [{ title: "gym", date: "2026-10-26", start: "07:00", weekly: true }, { title: "dentist", date: "2026-10-30", start: "15:00", weekly: false }],
  },
  { text: "remind me to pay rent tomorrow", clock: "10:00", want: [] }, // a reminder, not a calendar event
];

describe.skipIf(!LIVE)("calendar messages through the real model", () => {
  it.each(CASES.map((c) => [c.text.split("\n")[0].slice(0, 60), c] as const))("%s", async (_, c) => {
    const { callModel, decide } = await import("@/lib/agent/run");
    const { fakeDb, proposals } = await import("../helpers/fakeDb");
    const { db } = fakeDb(); // records writes (a reminder auto-saves); nothing reaches Supabase
    const ctx = { db, text: c.text, today: TODAY, clock: c.clock, meals: [], foods: [] };

    // The same path a chat message takes: model, then code checks and the cards shown.
    const calls = (await callModel(ctx)) ?? [];
    const store = proposals();
    const cards = await decide(calls, ctx, 0.85, store.propose);
    type Event = { kind: string; title?: unknown; date?: unknown; start?: unknown; end?: unknown; location?: unknown; weekly?: unknown; until?: unknown };
    const events: Event[] = [];
    for (const card of cards) {
      const id = (card as { proposalId?: string }).proposalId;
      const p = id ? store.stored.get(id) : undefined;
      if (p?.tool === "add_event") events.push({ kind: card.kind, ...p.resolved });
    }
    const report = JSON.stringify({ calls, cards }, null, 1);

    expect(events.length, report).toBe(c.want.length);
    c.want.forEach((w, i) => {
      const e = events.find((x) => String(x.title).toLowerCase().includes(w.title)) ?? events[i];
      // Every event ends on the confirm card; an end-only event with no start may be asked instead.
      expect(e.kind, report).toBe(w.start === null && w.end ? e.kind : "warning");
      expect(String(e.title).toLowerCase(), report).toContain(w.title);
      expect(e.date, report).toBe(w.date);
      if (!(w.start === null && w.end)) expect(e.start ?? null, report).toBe(w.start);
      if (w.end !== undefined) expect(e.end ?? null, report).toBe(w.end);
      if (w.location) expect(String(e.location), report).toContain(w.location);
      // Nothing repeats unless the case says so.
      expect(e.weekly === true, report).toBe(w.weekly ?? false);
      if (w.until) expect(e.until, report).toBe(w.until);
    });
  }, 60_000);
});
