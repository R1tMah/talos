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
