// The agent pipeline with a scripted model and an in-memory database:
// rules -> model -> code checks -> decide. Numbers refer to the test plan.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import type { ChatCard } from "@/lib/agent/cards";
import { commitCard, preRoute, run } from "@/lib/agent/run";
import { MODEL_TOOLS, TOOLS, type Ctx } from "@/lib/agent/tools";
import { logicalDateIn } from "@/lib/date";
import { ctxFor, fakeDb, MEALS, proposals, TODAY } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const THRESHOLD = 0.85;
const weights = (lb: number) => ({ weights: [{ weight_lb: lb, logical_date: "2026-10-10", deleted_at: null }] });
const apps = [
  { id: "app-roblox", company: "Roblox", position: "SWE", applied_date: "2026-08-02", status: "Applied", resume_name: null, deleted_at: null },
  { id: "app-g1", company: "Google", position: "SWE II", applied_date: "2026-07-08", status: "Applied", resume_name: null, deleted_at: null },
  { id: "app-g2", company: "Google", position: "SWE III", applied_date: "2026-08-20", status: "Applied", resume_name: null, deleted_at: null },
];

/** Runs one message through the pipeline. */
async function send(text: string, opts: { tables?: Record<string, Record<string, unknown>[]>; rpc?: NonNullable<Parameters<typeof fakeDb>[0]>["rpc"]; ctx?: Partial<Ctx> } = {}) {
  const f = fakeDb({ tables: { ...weights(169.0), applications: apps, ...opts.tables }, rpc: opts.rpc });
  const p = proposals();
  const result = await run(ctxFor(text, f.db, opts.ctx), THRESHOLD, p.propose);
  return { ...result, ...f, ...p };
}

const call = (name: string, input: Record<string, unknown>) => ({ name, input });
const weight = (lb: number, conf = 0.95, extra: Record<string, unknown> = {}) => call("log_weight", { weight_lb: lb, days_ago: null, note: null, confidence: conf, ...extra });
const food = (description: string, calories: number | null, protein: number | null, conf = 0.95) =>
  call("log_food", { description, food: null, servings: null, calories, protein_g: protein, carbs_g: null, fat_g: null, days_ago: null, confidence: conf });
const kinds = (cards: ChatCard[]) => cards.map((c) => c.kind);

beforeEach(() => model.reset());

// ---- 1. Logical day ------------------------------------------------------------------

describe("1. Logical day", () => {
  it('#3 "yesterday" at 02:00 resolves to the logical day minus one (two calendar days back)', async () => {
    const twoAm = new Date("2026-10-11T06:00:00Z"); // 02:00 in New York (EDT)
    const today = logicalDateIn("America/New_York", twoAm);
    expect(today).toBe("2026-10-10");
    const f = fakeDb({ tables: weights(169) });
    const check = await TOOLS.log_weight.check!({ weight_lb: 168, days_ago: 1, note: null, confidence: 1 }, ctxFor("168 yesterday", f.db, { today }));
    expect(check.status === "ready" && check.resolved.date).toBe("2026-10-09");
  });

  it("#7 the model never supplies a date: absolute dates in its arguments are ignored", async () => {
    const f = fakeDb({ tables: weights(169) });
    const check = await TOOLS.log_weight.check!({ weight_lb: 168, days_ago: null, note: null, date: "2020-01-01", logical_date: "2020-01-01", confidence: 1 }, ctxFor("168", f.db));
    expect(check.status === "ready" && check.resolved.date).toBe(TODAY);
  });

  it("#7 ...and no tool offers the model a date parameter, only day hints", () => {
    for (const t of MODEL_TOOLS) {
      const props = Object.keys((t.input_schema as { properties?: object }).properties ?? {});
      expect(props.filter((p) => /(^|_)date$/.test(p)), t.name).toEqual([]);
    }
  });
});

// ---- 2. Validation -----------------------------------------------------------------------

describe("2. Validation and plausibility", () => {
  it('#8 "1680" triggers "are you sure?" and saves nothing until confirmed', async () => {
    model.toolCalls(weight(1680));
    const r = await send("1680");
    expect(kinds(r.cards)).toEqual(["warning"]);
    expect(r.writes()).toEqual([]);
  });

  it("#9 168.2 after 169.0 saves normally", async () => {
    const r = await send("168.2");
    expect(kinds(r.cards)).toEqual(["saved"]);
    expect(r.writes().map((w) => w.fn)).toEqual(["save_weight"]);
  });

  it("#10 a weight more than 10 lb from the previous one triggers a warning", async () => {
    const r = await send("180");
    expect(kinds(r.cards)).toEqual(["warning"]);
    expect(r.writes()).toEqual([]);
  });

  it("#11 below 90 lb triggers a warning", async () => {
    model.toolCalls(weight(85));
    const r = await send("weighed 85");
    expect(kinds(r.cards)).toEqual(["warning"]);
  });

  it("#11 above 400 lb triggers a warning", async () => {
    model.toolCalls(weight(450));
    const r = await send("weighed 450");
    expect(kinds(r.cards)).toEqual(["warning"]);
  });

  it("#12 a food entry over 3,000 calories triggers a warning", async () => {
    model.toolCalls(food("cheat meal", 3500, 120));
    const r = await send("cheat meal 3500 cal 120p");
    expect(kinds(r.cards)).toEqual(["warning"]);
    expect(r.writes()).toEqual([]);
  });

  it("#12 a food entry over 300 g protein triggers a warning", async () => {
    model.toolCalls(food("shake stack", 900, 350));
    const r = await send("shake stack 900 cal 350p");
    expect(kinds(r.cards)).toEqual(["warning"]);
  });

  it("#13 LeetCode minutes over 180 trigger a warning", async () => {
    model.toolCalls(call("log_leetcode", { title: "Word Search II", time_text: "200 minutes", hints: null, result: null, redo: null, notes: null, difficulty: null, topic: null, days_ago: null, confidence: 0.95 }));
    const r = await send("Word Search II 200 minutes");
    expect(kinds(r.cards)).toEqual(["warning"]);
  });

  it("#15 a missing required field fails the check and saves nothing", async () => {
    model.toolCalls(call("log_weight", { days_ago: null, note: null, confidence: 0.95 }));
    const r = await send("weighed in this morning");
    expect(kinds(r.cards)).toEqual(["failed"]);
    expect(r.writes()).toEqual([]);
  });
});

// ---- 3. Weight routing -------------------------------------------------------------------

describe("3. Weight", () => {
  it('#23 a bare "168.2" routes to log_weight by rule with no model call', async () => {
    const r = await send("168.2");
    expect(r.route).toBe("rule");
    expect(model.requests).toHaveLength(0);
  });

  it("#24 a bare number far from recent weights does not auto-save; it asks", async () => {
    const r = await send("250");
    expect(kinds(r.cards)).toEqual(["warning"]);
    expect(r.writes()).toEqual([]);
  });

  it("#18 a second weight the same day becomes an Update? confirm card", async () => {
    const r = await send("168.2", {
      rpc: { save_weight: () => ({ status: "conflict", existing: { id: "w-today", weight_lb: 169, note: null } }) },
    });
    expect(kinds(r.cards)).toEqual(["confirm"]);
    const card = r.cards[0] as Extract<ChatCard, { kind: "confirm" }>;
    expect(card.changes).toEqual([{ field: "Weight", from: "169 lb", to: "168.2 lb" }]);
  });
});

// ---- 5. Nutrition --------------------------------------------------------------------------

describe("5. Nutrition and saved meals", () => {
  it('#33 "2100 cal 150 protein" logs a typed entry with those numbers', async () => {
    model.toolCalls(food("dinner", 2100, 150));
    const r = await send("dinner 2100 cal 150 protein");
    expect(kinds(r.cards)).toEqual(["saved"]);
    const w = r.writes()[0];
    expect(w.fn).toBe("log_food");
    expect(w.args).toMatchObject({ p_calories: 2100, p_protein_g: 150 });
    expect(w.args.p_source ?? "typed").toBe("typed");
  });

  it("numbers the owner didn't type are never used (no estimates)", async () => {
    model.toolCalls(food("burrito", 900, 40));
    const r = await send("had a burrito");
    expect(kinds(r.cards)).toEqual(["missing"]);
    expect(r.writes()).toEqual([]);
  });

  it('#37 "breakfast" alone logs nothing', async () => {
    model.toolCalls(call("log_saved_meal", { meal: "breakfast", portions: null, without: [], extra: [], days_ago: null, confidence: 0.7 }));
    const r = await send("breakfast");
    expect(r.writes()).toEqual([]);
    expect(kinds(r.cards)).not.toContain("saved");
  });

  it('#39 "weekday breakfast plus a banana" logs the meal plus one extra item', async () => {
    model.toolCalls(call("log_saved_meal", { meal: "weekday breakfast", portions: null, without: [], extra: [{ food: "banana", servings: null }], days_ago: null, confidence: 0.95 }));
    const r = await send("weekday breakfast plus a banana");
    expect(r.writes().map((w) => w.fn)).toEqual(["log_saved_meal", "log_food_item"]);
    expect(kinds(r.cards)).toEqual(["saved", "saved"]);
  });

  it("#40 two meals sharing an alias produce the picker, not a silent choice", async () => {
    const shared = [
      { id: "m-a", name: "Bowl A", aliases: ["usual bowl"], unit: "bowl", items: [] },
      { id: "m-b", name: "Bowl B", aliases: ["usual bowl"], unit: "bowl", items: [] },
    ];
    model.toolCalls(call("log_saved_meal", { meal: "usual bowl", portions: null, without: [], extra: [], days_ago: null, confidence: 0.95 }));
    const r = await send("the usual bowl", { ctx: { meals: shared } });
    expect(kinds(r.cards)).toEqual(["unsure"]);
    expect((r.cards[0] as Extract<ChatCard, { kind: "unsure" }>).options).toHaveLength(2);
    expect(r.writes()).toEqual([]);
  });

  it("#119 picking option 2 of the picker commits that option only", async () => {
    const shared = [
      { id: "m-a", name: "Bowl A", aliases: ["usual bowl"], unit: "bowl", items: [] },
      { id: "m-b", name: "Bowl B", aliases: ["usual bowl"], unit: "bowl", items: [] },
    ];
    model.toolCalls(call("log_saved_meal", { meal: "usual bowl", portions: null, without: [], extra: [], days_ago: null, confidence: 0.95 }));
    const r = await send("the usual bowl", { ctx: { meals: shared } });
    const second = (r.cards[0] as Extract<ChatCard, { kind: "unsure" }>).options[1];
    const stored = r.stored.get(second.proposalId)!;
    const f = fakeDb();
    await commitCard(stored.tool, stored.resolved as never, { db: f.db }, proposals().propose);
    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0].args.p_meal_id).toBe("m-b");
  });

  it("a typo'd meal name suggests the closest meal (did you mean) instead of failing", async () => {
    model.toolCalls(call("log_saved_meal", { meal: "protien max bwl", portions: null, without: [], extra: [], days_ago: null, confidence: 0.85 }));
    const r = await send("ate protien max bwl");
    const card = r.cards[0] as Extract<ChatCard, { kind: "unsure" }>;
    expect(card.kind).toBe("unsure");
    expect(card.title).toBe("Did you mean…");
    expect(card.options[0].fields[0][1]).toBe("Protein Maximized Chipotle Bowl");
    expect(r.writes()).toEqual([]);
  });
});

// ---- 6. LeetCode ------------------------------------------------------------------------------

describe("6. LeetCode", () => {
  const lc = (title: string, time_text: string | null, extra: Record<string, unknown> = {}) =>
    call("log_leetcode", { title, time_text, hints: null, result: null, redo: null, notes: null, difficulty: null, topic: null, days_ago: null, confidence: 0.95, ...extra });

  it("#51 mm:ss times convert to decimal minutes (28:14 -> 28.23)", async () => {
    model.toolCalls(lc("Car Fleet", "28:14"));
    const r = await send("Car Fleet 28:14");
    expect(r.writes().find((w) => w.fn === "log_leetcode")!.args.p_minutes).toBe(28.23);
  });

  it("#52 notes are passed through verbatim from the owner's words", async () => {
    const text = "Decode String 23:12 lowkey fuck ass problem 😭";
    model.toolCalls(lc("Decode String", "23:12", { notes: "lowkey fuck ass problem 😭" }));
    const r = await send(text);
    expect(r.writes().find((w) => w.fn === "log_leetcode")!.args.p_notes).toBe("lowkey fuck ass problem 😭");
  });

  it("a note the model rewrote is dropped, never saved", async () => {
    model.toolCalls(lc("Decode String", "23:12", { notes: "Found this problem difficult." }));
    const r = await send("Decode String 23:12 lowkey fuck ass problem");
    expect(r.writes().find((w) => w.fn === "log_leetcode")!.args.p_notes).toBeNull();
  });

  it("an enum value outside the allowed set counts as not said", async () => {
    model.toolCalls(lc("Two Sum", "5:00", { hints: "lots", result: "great" }));
    const r = await send("Two Sum 5:00");
    const args = r.writes().find((w) => w.fn === "log_leetcode")!.args;
    expect([args.p_hints, args.p_result]).toEqual([null, null]);
  });
});

// ---- 7. Applications ----------------------------------------------------------------------------

describe("7. Applications", () => {
  const app = (company: string, extra: Record<string, unknown> = {}) =>
    call("add_application", { company, position: null, applied_days_ago: null, status: null, resume_name: null, confidence: 0.95, ...extra });

  it('#54 "applied to Stripe" lists position, date, status and resume name as missing and creates no row', async () => {
    model.toolCalls(app("Stripe"));
    const r = await send("applied to Stripe");
    expect(kinds(r.cards)).toEqual(["missing"]);
    const card = r.cards[0] as Extract<ChatCard, { kind: "missing" }>;
    expect(card.missing.map((m) => m.name)).toEqual(["position", "applied_date", "status", "resume_name"]);
    expect(r.writes()).toEqual([]);
  });

  it("#55 / #61 filling the fields creates the row; the agent never fills a default", () => {
    const draft = { company: "Stripe", position: null, applied_date: null, status: null, resume_name: null };
    expect(TOOLS.add_application.fill!(draft, {})).toBe("Fill in position, date and status.");
    expect(TOOLS.add_application.fill!(draft, { position: "SWE", applied_date: "2026-10-11" })).toBe("Fill in position, date and status.");
    const filled = TOOLS.add_application.fill!(draft, { position: "SWE", applied_date: "2026-10-11", status: "Applied" });
    expect(filled).toMatchObject({ position: "SWE", applied_date: "2026-10-11", status: "Applied", resume_name: null });
  });

  it("#61 a commit with required fields missing is refused", async () => {
    const f = fakeDb();
    const out = await TOOLS.add_application.commit({ company: "Stripe", position: null, applied_date: null, status: null, resume_name: null }, f.db);
    expect(out.status).toBe("failed");
    expect(f.writes()).toEqual([]);
  });

  it('#56 "Roblox rejected" shows old to new status and needs Confirm', async () => {
    model.toolCalls(call("update_application", { company: "Roblox", status: "rejected", position: null, resume_name: null, confidence: 0.95 }));
    const r = await send("Roblox rejected");
    expect(kinds(r.cards)).toEqual(["confirm"]);
    expect((r.cards[0] as Extract<ChatCard, { kind: "confirm" }>).changes).toEqual([{ field: "Status", from: "Applied", to: "Rejected" }]);
    expect(r.writes()).toEqual([]);
  });

  it("#58 a company with two applications shows the picker", async () => {
    model.toolCalls(call("update_application", { company: "Google", status: "rejected", position: null, resume_name: null, confidence: 0.95 }));
    const r = await send("google rejected me");
    expect(kinds(r.cards)).toEqual(["unsure"]);
    expect((r.cards[0] as Extract<ChatCard, { kind: "unsure" }>).options).toHaveLength(2);
  });

  it("#112 an edit shows Confirm even at confidence 1.0", async () => {
    model.toolCalls(call("update_application", { company: "Roblox", status: "rejected", position: null, resume_name: null, confidence: 1 }));
    const r = await send("Roblox rejected");
    expect(kinds(r.cards)).toEqual(["confirm"]);
  });
});

// ---- 8. Callbacks ----------------------------------------------------------------------------------

describe("8. Callbacks", () => {
  const cb = (company: string, debrief: string | null, extra: Record<string, unknown> = {}) =>
    call("log_callback", { company, kind: "Interview", score: null, outcome: null, debrief, days_ago: null, confidence: 0.95, ...extra });

  it("#62 the debrief is passed through byte for byte", async () => {
    const debrief = "holy fuck that was insane 😭  they asked binary lifting";
    model.toolCalls(cb("Scale AI", debrief));
    const r = await send(`Scale AI interview today, ${debrief}`);
    expect(r.writes()[0].args.p_debrief).toBe(debrief);
  });

  it("#63 a debrief the model reworded is replaced by the owner's whole message, never saved reworded", async () => {
    const text = "Scale AI interview, holy shit that was hard";
    model.toolCalls(cb("Scale AI", "The interview was challenging."));
    const r = await send(text);
    expect(r.writes()[0].args.p_debrief).toBe(text);
  });

  it("#64 a callback for an unknown company offers to add an application and creates nothing else", async () => {
    model.toolCalls(cb("Ramp", null, { kind: "OA" }));
    const r = await send("Ramp OA", { rpc: { log_callback: (a: Record<string, unknown>) => ({ status: "saved", row: { company: a.p_company, kind: a.p_kind, logical_date: a.p_date }, action_id: "a1", has_application: false }) } });
    expect(kinds(r.cards)).toEqual(["saved", "missing"]);
    expect(r.writes().map((w) => w.fn)).toEqual(["log_callback"]);
  });

  it("#68 the score is passed through as typed text", async () => {
    model.toolCalls(cb("TikTok", null, { kind: "OA", score: "508/600" }));
    const r = await send("TikTok OA 508/600");
    expect(r.writes()[0].args.p_score).toBe("508/600");
  });
});

// ---- 10. Notes ---------------------------------------------------------------------------------------

describe("10. Notes", () => {
  it('#86 "content idea ..." saves a content entry from the owner\'s text', async () => {
    const r = await send("content idea: a day in the life");
    expect(r.route).toBe("rule");
    expect(r.writes()[0].args).toMatchObject({ p_kind: "content", p_body: "a day in the life" });
  });

  it("#87 the command prefix is stripped and the rest saved exactly", async () => {
    const r = await send("content idea:   how I cut 30 lb 😭\n- part 2  ");
    expect(r.writes()[0].args.p_body).toBe("how I cut 30 lb 😭\n- part 2  ");
  });

  it("#88 a journal entry saves verbatim", async () => {
    const r = await send("journal: shipped the undo feature, lowkey proud");
    expect(r.writes()[0].args).toMatchObject({ p_kind: "journal", p_body: "shipped the undo feature, lowkey proud" });
  });

  it("#89 the model's version of the text is never what's saved", async () => {
    model.toolCalls(call("add_note", { kind: "content", text: "A Day In The Life!", confidence: 0.95 }));
    const r = await send("idea for a video, a day in the life");
    expect(r.writes()[0].args.p_body).not.toBe("A Day In The Life!");
    expect("idea for a video, a day in the life").toContain(String(r.writes()[0].args.p_body));
  });
});

// ---- 12. Pre-routing rules -----------------------------------------------------------------------------

describe("12. Pre-routing rules", () => {
  it("#96 an exact saved meal name routes by rule without a model call", async () => {
    const r = await send("had my flatbread dinner");
    expect(r.route).toBe("rule");
    expect(model.requests).toHaveLength(0);
    expect(r.writes()[0]).toMatchObject({ fn: "log_saved_meal", args: { p_meal_id: "m-flat" } });
  });

  it("#98 alias matching ignores case and extra whitespace", () => {
    const calls = preRoute(ctxFor("  Had my   PROTEIN  max BOWL ", fakeDb().db));
    expect(calls?.[0]).toMatchObject({ name: "log_saved_meal", input: { meal: "Protein Maximized Chipotle Bowl" } });
  });
});

// ---- 13. Model contract ---------------------------------------------------------------------------------

describe("13. Model contract (mocked API)", () => {
  it("#99 a response with only text is treated as unmapped and writes nothing", async () => {
    model.text("Sure! I logged that for you.");
    const r = await send("random thing");
    expect(r.writes()).toEqual([]);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].kind).not.toBe("saved");
  });

  it("#100 / #105 model prose (including advice) never appears in any card", async () => {
    model.raw({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "You should eat fewer calories to hit your goal." },
        { type: "tool_use", id: "t1", name: "log_weight", input: { weight_lb: 168.2, days_ago: null, note: null, confidence: 0.95 } },
      ],
    });
    const r = await send("weighed 168.2 this morning");
    expect(JSON.stringify(r.cards)).not.toMatch(/fewer calories|goal/i);
  });

  it("#101 a tool call with an unknown tool name is rejected", async () => {
    model.toolCalls(call("delete_everything", { confidence: 1 }));
    const r = await send("do it");
    expect(r.writes()).toEqual([]);
  });

  it("#102 a tool call whose arguments fail the checks is rejected", async () => {
    model.toolCalls(call("log_weight", { weight_lb: "heavy", days_ago: null, note: null, confidence: 0.99 }));
    const r = await send("heavy");
    expect(kinds(r.cards)).toEqual(["failed"]);
    expect(r.writes()).toEqual([]);
  });

  it("#103 a multi-item message produces separate cards", async () => {
    model.toolCalls(weight(168.2), call("add_note", { kind: "content", text: "a day in the life", confidence: 0.95 }));
    const r = await send("weight 168.2, content idea: a day in the life");
    expect(kinds(r.cards)).toEqual(["saved", "saved"]);
    expect(r.writes().map((w) => w.fn)).toEqual(["save_weight", "add_note"]);
  });

  it("#104 no_match with candidates produces the picker", async () => {
    model.toolCalls(call("no_match", { candidates: [{ tool: "log_weight", args_json: '{"weight_lb":170,"days_ago":null,"note":null}', confidence: 0.5 }] }));
    const r = await send("170 or so?");
    expect(kinds(r.cards)).toEqual(["unsure"]);
    expect(r.writes()).toEqual([]);
  });

  it('#107 a model error or timeout returns "Failed" and writes nothing', async () => {
    model.fail("timeout");
    const r = await send("weighed in at 168");
    expect(kinds(r.cards)).toEqual(["failed"]);
    expect(r.writes()).toEqual([]);
  });

  it("text messages use the small model, with the tool list and no sampling parameters", async () => {
    model.toolCalls(weight(168));
    await send("weighed in at 168");
    expect(model.requests[0]).toMatchObject({ model: "claude-haiku-5-5", tool_choice: { type: "auto" } });
    expect(model.requests[0]).not.toHaveProperty("temperature");
  });
});

// ---- 14. Confidence and pipeline -------------------------------------------------------------------------

describe("14. Confidence and pipeline", () => {
  it("#108 confident, clearly leading and passing checks auto-saves with an Undo id", async () => {
    model.toolCalls(weight(168.5, 0.95));
    const r = await send("weighed in at 168.5");
    expect(r.cards[0]).toMatchObject({ kind: "saved" });
    expect((r.cards[0] as Extract<ChatCard, { kind: "saved" }>).actionId).toBeTruthy();
  });

  it("#109 confidence below the threshold shows the picker", async () => {
    model.toolCalls(weight(168.5, 0.6));
    const r = await send("168.5 i think");
    expect(kinds(r.cards)).toEqual(["unsure"]);
    expect(r.writes()).toEqual([]);
  });

  it("#110 above the threshold but out of range shows the warning, not a save", async () => {
    model.toolCalls(weight(250, 0.99));
    const r = await send("weighed 250");
    expect(kinds(r.cards)).toEqual(["warning"]);
  });

  it("#111 a top reading that doesn't lead the runner-up by the margin shows the picker", async () => {
    model.toolCalls(
      weight(170, 0.9),
      call("no_match", { candidates: [{ tool: "log_weight", args_json: '{"weight_lb":170,"days_ago":1,"note":null}', confidence: 0.8 }] }),
    );
    // Not a bare number, so the weight rule doesn't take it before the model.
    const r = await send("170 this morning or yesterday");
    expect(kinds(r.cards)).toEqual(["unsure"]);
    expect(r.writes()).toEqual([]);
  });

  it("#112 editing a saved meal shows Confirm even at confidence 1.0", async () => {
    model.toolCalls(call("save_meal", { name: "Homemade Flatbread Chicken", aliases: [], unit: null, calories: 320, protein_g: null, confidence: 1 }));
    const r = await send("flatbread is 320 cal now", {
      tables: { saved_meals: [{ id: "m-flat", name: "Homemade Flatbread Chicken", aliases: ["flatbread"], portion_unit: "serving", calories: 300, protein_g: 33, carbs_g: null, fat_g: null, deleted_at: null }] },
    });
    expect(kinds(r.cards)).toEqual(["confirm"]);
    expect(r.writes()).toEqual([]);
  });

  it("#114 nothing is dropped: every message ends in at least one card", async () => {
    const scripts: [string, () => void][] = [
      ["168.2", () => {}],
      ["asdf", () => model.text("hmm")],
      ["??", () => model.toolCalls(call("no_match", { candidates: [] }))],
      ["timeout", () => model.fail()],
    ];
    for (const [text, script] of scripts) {
      model.reset();
      script();
      const r = await send(text);
      expect(r.cards.length, text).toBeGreaterThan(0);
    }
  });
});

void MEALS;
