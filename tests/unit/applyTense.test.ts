// "apply to X" is a To apply reminder; "applied to X" is an application. Code settles it, not the model.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { applyTense, postingFrom, run } from "@/lib/agent/run";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

describe("which verb the owner used", () => {
  it.each([
    ["apply to Ramp for SWE", "Ramp", "plan"],
    ["need to apply to Stripe new grad", "Stripe", "plan"],
    ["remind me to apply to Figma", "Figma", "plan"],
    ["applied to Ramp for SWE today", "Ramp", "done"],
    ["just applied at Figma", "Figma", "done"],
    ["applied to Stripe, need to apply to Ramp", "Stripe", "done"],
    ["applied to Stripe, need to apply to Ramp", "Ramp", "plan"],
    ["call the landlord", undefined, null],
  ])("%s (%s) -> %s", (text, company, want) => expect(applyTense(text, company)).toBe(want));
});

describe("reading a posting out of 'apply to ...'", () => {
  it.each([
    ["apply to Ramp for SWE", { company: "Ramp", position: "SWE" }],
    ["apply to Stripe as a new grad engineer by Friday", { company: "Stripe", position: "new grad engineer" }],
    ["apply for the PM role at Figma", { company: "Figma", position: "PM" }],
    ["apply to Notion later", { company: "Notion", position: null }],
  ])("%s", (text, want) => expect(postingFrom(text)).toEqual(want));
});

describe("chat", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, ...calls: { name: string; input: Record<string, unknown> }[]) => {
    model.toolCalls(...calls);
    const f = fakeDb();
    const r = await run(ctxFor(text, f.db), 0.85, proposals().propose);
    return { ...r, writes: f.writes() };
  };

  it("'apply to' the model read as an application becomes a To apply reminder", async () => {
    const r = await send("apply to Ramp for SWE", {
      name: "add_application",
      input: { company: "Ramp", position: "SWE", applied_days_ago: 0, status: null, resume_name: null, confidence: 0.9 },
    });
    expect(r.cards[0].kind).toBe("saved");
    expect(r.writes[0]).toMatchObject({ fn: "add_application_reminder", args: { p_company: "Ramp", p_position: "SWE" } });
  });

  it("'remind me to apply to' the model read as a general reminder becomes a To apply reminder", async () => {
    const r = await send("remind me to apply to Stripe for new grad", {
      name: "add_reminder",
      input: { text: "apply to Stripe for new grad", due_text: null, confidence: 0.95 },
    });
    expect(r.writes[0]).toMatchObject({ fn: "add_application_reminder", args: { p_company: "Stripe", p_position: "new grad" } });
  });

  it("'applied to' the model read as a plan becomes an application", async () => {
    const r = await send("applied to Figma for PM", { name: "plan_application", input: { company: "Figma", position: "PM", confidence: 0.6 } });
    // The date wasn't said, so the card asks for it rather than guessing.
    expect(r.cards[0].kind).toBe("missing");
    expect(r.calls[0].name).toBe("add_application");
  });

  it("a general reminder stays a general reminder", async () => {
    const r = await send("remind me to call the landlord", { name: "add_reminder", input: { text: "call the landlord", due_text: null, confidence: 0.95 } });
    expect(r.writes[0]).toMatchObject({ fn: "add_reminder", args: { p_body: "call the landlord" } });
  });

  it("the verb settles the tool even when the model was unsure", async () => {
    const r = await send("apply to Notion for design eng", { name: "plan_application", input: { company: "Notion", position: "design eng", confidence: 0.5 } });
    expect(r.cards[0].kind).toBe("saved");
  });
});
