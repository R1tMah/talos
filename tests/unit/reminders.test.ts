// General reminders in chat: verbatim text, due dates read by code (never the model).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { run } from "@/lib/agent/run";
import { dueFrom } from "@/lib/agent/tools";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const TODAY = "2026-10-11"; // a Sunday

describe("due dates from the owner's words", () => {
  it.each([
    ["today", "2026-10-11"],
    ["tomorrow", "2026-10-12"],
    ["in 3 days", "2026-10-14"],
    ["in 2 weeks", "2026-10-25"],
    ["friday", "2026-10-16"],
    ["by Fri", "2026-10-16"],
    ["sunday", "2026-10-18"], // today is Sunday: the next one
    ["11/1", "2026-11-01"],
    ["Nov 1", "2026-11-01"],
    ["jan 5", "2027-01-05"], // already past this year: next year
  ])("%s -> %s", (text, want) => expect(dueFrom(text, TODAY)).toBe(want));

  it("anything it can't read is no due date, never a guess", () => {
    expect(dueFrom("sometime soon", TODAY)).toBeNull();
    expect(dueFrom("13/45", TODAY)).toBeNull();
    expect(dueFrom(null, TODAY)).toBeNull();
  });
});

describe("add_reminder", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, input: Record<string, unknown>) => {
    model.toolCalls({ name: "add_reminder", input: { confidence: 0.95, ...input } });
    const f = fakeDb();
    const r = await run(ctxFor(text, f.db), 0.85, proposals().propose);
    return { ...r, writes: f.writes() };
  };

  it("saves the owner's words and a due date code worked out", async () => {
    const r = await send("remind me to renew my passport by Nov 1", { text: "renew my passport", due_text: "Nov 1" });
    expect(r.cards[0].kind).toBe("saved");
    expect(r.writes[0]).toMatchObject({ fn: "add_reminder", args: { p_body: "renew my passport", p_due: "2026-11-01" } });
  });

  it("a reworded reminder falls back to the owner's text minus 'remind me to'", async () => {
    const r = await send("remind me to call the landlord abt the lease 😩", { text: "Call the landlord about the lease.", due_text: null });
    expect(r.writes[0].args.p_body).toBe("call the landlord abt the lease 😩");
  });

  it("a due date the model made up (not in the message) is ignored", async () => {
    const r = await send("remind me to stretch", { text: "stretch", due_text: "tomorrow" });
    expect(r.writes[0].args.p_due).toBeNull();
  });
});

describe("far-off dates, for long-term reminders", () => {
  it.each([
    ["in 6 months", "2027-04-11"],
    ["in 2 years", "2028-10-11"],
    ["2027-03-01", "2027-03-01"],
    ["3/1/2027", "2027-03-01"],
    ["3/1/27", "2027-03-01"],
    ["Mar 1, 2027", "2027-03-01"],
    ["march 1st 2027", "2027-03-01"],
    ["March 2027", "2027-03-01"],
  ])("%s -> %s", (text, want) => expect(dueFrom(text, TODAY)).toBe(want));

  it("a day that doesn't exist is null", () => {
    expect(dueFrom("Feb 30, 2027", TODAY)).toBeNull();
    expect(dueFrom("2/30/2027", TODAY)).toBeNull();
  });

  it("a month on from the 31st lands on the month's last day", () => {
    expect(dueFrom("in 1 month", "2027-01-31")).toBe("2027-02-28");
  });
});

describe("add_long_term_reminder", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, call: { name: string; input: Record<string, unknown> }) => {
    model.toolCalls({ ...call, input: { confidence: 0.95, ...call.input } });
    const f = fakeDb();
    const r = await run(ctxFor(text, f.db), 0.85, proposals().propose);
    return { ...r, writes: f.writes() };
  };
  const lt = (input: Record<string, unknown>) => ({ name: "add_long_term_reminder", input });

  it("saves the owner's words with the show-from and due dates code worked out", async () => {
    const r = await send("add a long term reminder to renew my passport, show it Feb 1 2027, due Mar 15 2027", lt({ text: "renew my passport", show_text: "Feb 1 2027", due_text: "Mar 15 2027" }));
    expect(r.cards[0].kind).toBe("saved");
    expect(r.writes[0]).toMatchObject({ fn: "add_reminder", args: { p_body: "renew my passport", p_surface: "2027-02-01", p_due: "2027-03-15", p_tool: "add_long_term_reminder" } });
  });

  it("without a show-from date, asks for one instead of guessing", async () => {
    const r = await send("add a long term reminder to look into grad school", lt({ text: "look into grad school", show_text: null, due_text: null }));
    expect(r.cards[0]).toMatchObject({ kind: "missing", missing: [{ name: "surface", type: "date" }] });
    expect(r.writes).toHaveLength(0);
  });

  it("the phrase settles the tool even when the model is unsure", async () => {
    const r = await send("add a long term reminder to call grandma, in 3 months", lt({ text: "call grandma", show_text: "in 3 months", due_text: null, confidence: 0.4 }));
    expect(r.cards[0].kind).toBe("saved");
    expect(r.writes[0].args.p_surface).toBe("2027-01-11");
  });

  it("a plain add_reminder for a 'long term reminder' message is turned into a long-term one", async () => {
    const r = await send("add a long term reminder to renew my license", { name: "add_reminder", input: { text: "renew my license", due_text: null } });
    expect(r.calls[0].name).toBe("add_long_term_reminder");
    expect(r.cards[0].kind).toBe("missing");
  });

  it("a reworded body falls back to the owner's text minus 'add a long term reminder to'", async () => {
    const r = await send("Add a long-term reminder to cancel the gym b4 renewal", lt({ text: "Cancel the gym before renewal.", show_text: null, due_text: null }));
    expect(r.cards[0]).toMatchObject({ kind: "missing" });
    expect((r.cards[0] as { title: string }).title).toBe("Long-term reminder: cancel the gym b4 renewal");
  });

  it("showing up after it's due is refused", async () => {
    const r = await send("add a long term reminder to renew my passport, show it Apr 1 2027, due Mar 15 2027", lt({ text: "renew my passport", show_text: "Apr 1 2027", due_text: "Mar 15 2027" }));
    expect(r.cards[0].kind).toBe("failed");
    expect(r.writes).toHaveLength(0);
  });

  it("an ordinary 'remind me to' stays an ordinary reminder", async () => {
    const r = await send("remind me to call the landlord", { name: "add_reminder", input: { text: "call the landlord", due_text: null } });
    expect(r.writes[0]).toMatchObject({ fn: "add_reminder", args: { p_body: "call the landlord" } });
    expect(r.writes[0].args.p_surface).toBeUndefined();
  });
});
