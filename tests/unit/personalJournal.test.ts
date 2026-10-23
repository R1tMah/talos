// The personal journal: entries saved verbatim, routed by rule or chip without a model call.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { preRoute, run } from "@/lib/agent/run";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const kindFor = (text: string) => preRoute(ctxFor(text, fakeDb().db))?.[0]?.input.kind;

describe("Personal journal", () => {
  beforeEach(() => model.reset());

  it.each([
    ["personal: rough day, called mom", "personal"],
    ["Personal journal - went on a long walk", "personal"],
    ["diary: couldn't sleep", "personal"],
    ["work journal: shipped auth", "journal"],
    ["journal: standup went long", "journal"],
    ["content idea: a day in the life", "content"],
  ])("%s -> %s", (text, kind) => expect(kindFor(text)).toBe(kind));

  it("a personal prefix saves the rest byte for byte, with no model call", async () => {
    const f = fakeDb();
    const r = await run(ctxFor("personal:   rough day 😞\n  called mom  ", f.db), 0.85, proposals().propose);
    expect(model.requests).toHaveLength(0);
    expect(f.writes()[0]).toMatchObject({ fn: "add_note", args: { p_kind: "personal", p_body: "rough day 😞\n  called mom  " } });
    expect(r.cards[0]).toMatchObject({ kind: "saved", label: "Personal journal: rough day 😞\n  called mom  " });
  });

  it("the Personal Journal chip saves the whole message, with no model call", async () => {
    const f = fakeDb();
    await run({ ...ctxFor("went to the beach, felt good", f.db), tab: "personal" }, 0.85, proposals().propose);
    expect(model.requests).toHaveLength(0);
    expect(f.writes()[0]).toMatchObject({ fn: "add_note", args: { p_kind: "personal", p_body: "went to the beach, felt good" } });
  });

  it("an archived Personal Journal refuses chat writes", async () => {
    const f = fakeDb();
    const r = await run({ ...ctxFor("personal: test", f.db), archived: new Set(["personal"]) }, 0.85, proposals().propose);
    expect(f.writes()).toEqual([]);
    expect(r.cards[0]).toMatchObject({ kind: "failed" });
  });

  it("an unlabeled personal entry the model files as personal keeps the owner's words", async () => {
    model.toolCalls({ name: "add_note", input: { kind: "personal", text: "Had a rough day.", confidence: 0.95 } });
    const f = fakeDb();
    await run(ctxFor("ugh rough day honestly, called mom", f.db), 0.85, proposals().propose);
    expect(f.writes()[0].args).toMatchObject({ p_kind: "personal", p_body: "ugh rough day honestly, called mom" });
  });
});

describe("Talos improvements", () => {
  beforeEach(() => model.reset());

  it.each([
    ["add to talos: watch tab, any reminders", "talos"],
    ["talos: better ui for the agent", "talos"],
    ["Talos improvement - dark mode chart colors", "talos"],
    ["work journal: shipped auth", "journal"],
  ])("%s -> %s", (text, kind) => expect(kindFor(text)).toBe(kind));

  it('"add to talos: ..." saves the rest verbatim with no model call', async () => {
    const f = fakeDb();
    const r = await run(ctxFor("add to talos: watch tab, any reminders, better ui for the agent", f.db), 0.85, proposals().propose);
    expect(model.requests).toHaveLength(0);
    expect(f.writes()[0]).toMatchObject({ fn: "add_note", args: { p_kind: "talos", p_body: "watch tab, any reminders, better ui for the agent" } });
    expect(r.cards[0]).toMatchObject({ kind: "saved" });
  });

  it("the Talos Improvements chip saves the whole message with no model call", async () => {
    const f = fakeDb();
    await run({ ...ctxFor("export should match the weight log", f.db), tab: "talos" }, 0.85, proposals().propose);
    expect(model.requests).toHaveLength(0);
    expect(f.writes()[0]).toMatchObject({ args: { p_kind: "talos", p_body: "export should match the weight log" } });
  });
});
