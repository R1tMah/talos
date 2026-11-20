import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { draftFromAnswers, draftFromOneShot, fromCheck, needsModel, spendingText, toolsFor, type Extraction } from "@/lib/agent/eod";
import { TOOLS, type Db } from "@/lib/agent/tools";
import { DEFAULT_PROMPT, EOD_TARGETS, eodCommand, isCancel, isEodTime, isSkip, isToolTarget, type EodTarget } from "@/lib/eod";

const none: Extraction = { work_journal: null, personal_journal: null, content_idea: null, talos_idea: null, spending: [] };

describe("EOD: the chat command", () => {
  it("starts the questions on a bare EOD", () => {
    for (const t of ["EOD", "eod", " Eod. ", "end of day", "End of the day!"]) expect(eodCommand(t)).toEqual({ kind: "start" });
  });

  it("takes a whole paragraph after EOD as a one-shot", () => {
    expect(eodCommand("EOD: Shipped auth, feeling tired, spent 12 on lunch")).toEqual({
      kind: "oneShot", text: "Shipped auth, feeling tired, spent 12 on lunch",
    });
    expect(eodCommand("eod - shipped the auth fix today")).toEqual({ kind: "oneShot", text: "shipped the auth fix today" });
    expect(eodCommand("EOD shipped the auth fix today")).toEqual({ kind: "oneShot", text: "shipped the auth fix today" });
  });

  it("leaves ordinary messages alone", () => {
    expect(eodCommand("eod: ok")).toBeNull(); // too short to be a day
    expect(eodCommand("eodometer reading")).toBeNull();
    expect(eodCommand("ate eggs")).toBeNull();
    expect(eodCommand("the EOD sync went long")).toBeNull();
  });

  it("knows skip and stop answers", () => {
    for (const t of ["skip", "no", "Nothing.", "none", "n/a", "-", "nothing today"]) expect(isSkip(t)).toBe(true);
    for (const t of ["no spending was fun", "skipped lunch", "12 sandwich"]) expect(isSkip(t)).toBe(false);
    for (const t of ["cancel", "Stop.", "never mind"]) expect(isCancel(t)).toBe(true);
    expect(isCancel("stop at the store")).toBe(false);
  });
});

describe("EOD: interview answers", () => {
  it("saves journal answers exactly as typed, with no model call", () => {
    const answers = [
      { target: "journal" as const, text: "Shipped the auth fix  " },
      { target: "personal" as const, text: "tired, but good" },
    ];
    expect(needsModel(answers)).toBe(false);
    expect(draftFromAnswers(answers, null)).toEqual({
      notes: [{ kind: "journal", body: "Shipped the auth fix" }, { kind: "personal", body: "tired, but good" }],
      spending: [], answers: [], unclear: [],
    });
  });

  it("keeps own-log answers under the stored wording of their question", () => {
    const prompts = new Map([["q1", "How did I sleep?"]]);
    const d = draftFromAnswers([
      { target: "custom", text: " 7 hours, woke up once ", questionId: "q1" },
      { target: "custom", text: "skip", questionId: "q1" },
      { target: "custom", text: "orphan answer", questionId: "gone" },
    ], null, prompts);
    expect(d.answers).toEqual([{ questionId: "q1", prompt: "How did I sleep?", body: "7 hours, woke up once" }]);
    expect(d.notes).toEqual([]);
    expect(d.unclear).toHaveLength(1);
    expect(needsModel([{ target: "custom", text: "$12 lunch", questionId: "q1" }])).toBe(false);
  });

  it("drops skipped answers", () => {
    const d = draftFromAnswers([{ target: "journal", text: "skip" }, { target: "spending", text: "none" }], null);
    expect(d.notes).toEqual([]);
    expect(d.spending).toEqual([]);
    expect(needsModel([{ target: "spending", text: "nothing" }])).toBe(false);
  });

  it("keeps purchases only with an amount and words the owner typed", () => {
    const answers = [{ target: "spending" as const, text: "$12 for a sandwich, 4.50 coffee" }];
    expect(needsModel(answers)).toBe(true);
    expect(spendingText(answers)).toBe("$12 for a sandwich, 4.50 coffee");
    const ex: Extraction = {
      ...none,
      spending: [
        { amount: 12, what: "sandwich", category: "Food & drink" },
        { amount: 4.5, what: "coffee", category: "Not a category" },
        { amount: 30, what: "sandwich", category: "Food & drink" }, // amount never typed
        { amount: 9, what: "burrito bowl", category: "Food & drink" }, // words never typed
        { amount: null, what: "coffee", category: "Food & drink" },
      ],
    };
    expect(draftFromAnswers(answers, ex).spending).toEqual([
      { amount: 12, what: "sandwich", category: "Food & drink" },
      { amount: 4.5, what: "coffee", category: "Other" },
    ]);
  });

  it("says so when a spending answer has no usable amount", () => {
    const d = draftFromAnswers([{ target: "spending", text: "a sandwich" }], { ...none, spending: [{ amount: null, what: "sandwich", category: "Food & drink" }] });
    expect(d.spending).toEqual([]);
    expect(d.unclear[0]).toMatch(/couldn't find an amount/i);
  });

  it("survives the model being unreachable", () => {
    const d = draftFromAnswers([{ target: "journal", text: "shipped" }, { target: "spending", text: "$5 tea" }], null);
    expect(d.notes).toHaveLength(1);
    expect(d.spending).toEqual([]);
    expect(d.unclear).toHaveLength(1);
  });
});

describe("EOD: one-shot messages", () => {
  const text = "Shipped auth, feeling tired, spent 12 on lunch";
  const all = new Set<EodTarget>(["journal", "personal", "content", "talos", "spending"]);
  const ex: Extraction = {
    ...none,
    work_journal: "shipped auth", // case differs: the owner's own casing is kept
    personal_journal: "feeling tired",
    talos_idea: "add dark mode", // never written: dropped
    spending: [{ amount: 12, what: "lunch", category: "Food & drink" }],
  };

  it("keeps only spans and amounts from the message", () => {
    expect(draftFromOneShot(text, ex, all)).toEqual({
      notes: [{ kind: "journal", body: "Shipped auth" }, { kind: "personal", body: "feeling tired" }],
      spending: [{ amount: 12, what: "lunch", category: "Food & drink" }],
      answers: [], unclear: [],
    });
  });

  it("keeps only what the questions ask about", () => {
    const d = draftFromOneShot(text, ex, new Set<EodTarget>(["journal"]));
    expect(d.notes).toEqual([{ kind: "journal", body: "Shipped auth" }]);
    expect(d.spending).toEqual([]);
  });

  it("says so when nothing could be sorted", () => {
    expect(draftFromOneShot(text, null, all).unclear).toHaveLength(1);
  });
});

describe("EOD: the 10 PM button", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m);
  it("shows from 10 PM until the 4 AM day change", () => {
    expect(isEodTime(at(21, 59))).toBe(false);
    expect(isEodTime(at(22, 0))).toBe(true);
    expect(isEodTime(at(23, 30))).toBe(true);
    expect(isEodTime(at(1, 15))).toBe(true);
    expect(isEodTime(at(3, 59))).toBe(true);
    expect(isEodTime(at(4, 0))).toBe(false);
    expect(isEodTime(at(13, 0))).toBe(false);
  });
});

describe("EOD: ticking reminders", () => {
  const fill = TOOLS.save_eod.fill!;
  const stored = { date: "2026-11-06", notes: [], spending: [], reminders: [{ id: "a", body: "Call mom", due: "2026-11-06" }, { id: "b", body: "Pay rent", due: null }] };

  it("marks only reminders the card offered", () => {
    expect(fill(stored, { done: "a,zzz, b ,a" })).toMatchObject({ done: ["a", "b"] });
  });

  it("marks none when nothing was ticked", () => {
    expect(fill(stored, { done: "" })).toMatchObject({ done: [] });
    expect(fill(stored, {})).toMatchObject({ done: [] });
  });
});

describe("EOD: questions about any tab", () => {
  it("every target has a starter question, and the database accepts every target", () => {
    for (const t of EOD_TARGETS) expect(DEFAULT_PROMPT[t.key].trim(), t.key).not.toBe("");
    const sql = readFileSync(new URL("../../supabase/migrations/20261113100000_eod_all_tabs.sql", import.meta.url), "utf8");
    for (const t of EOD_TARGETS) expect(sql, t.key).toContain(`'${t.key}'`);
  });

  it("journals, spending and own-log answers stay in EOD's own save; the rest use a tab's tools", () => {
    expect(["journal", "personal", "content", "talos", "spending", "custom"].some((t) => isToolTarget(t as EodTarget))).toBe(false);
    expect(isToolTarget("weight")).toBe(true);
    expect(isToolTarget("reminders")).toBe(true);
  });

  it("each tab answer may use only that tab's chat tools, and they all exist", () => {
    expect(toolsFor("weight")).toEqual(["log_weight"]);
    expect(toolsFor("runs")).toEqual(["log_run"]);
    expect(toolsFor("reminders")).toEqual(["add_reminder", "add_long_term_reminder"]);
    for (const t of EOD_TARGETS) if (isToolTarget(t.key)) for (const tool of toolsFor(t.key)) expect(TOOLS[tool], `${t.key}: ${tool}`).toBeDefined();
  });

  it("a tab answer isn't saved as a journal note", () => {
    const d = draftFromAnswers([{ target: "runs", text: "ran 3 miles in 27 min" }, { target: "journal", text: "shipped it" }], null);
    expect(d.notes).toEqual([{ kind: "journal", body: "shipped it" }]);
  });
});

describe("EOD: what a checked tab answer puts on the card", () => {
  const resolved = { miles: 3 };

  it("a ready write becomes an entry, shown with its fields", () => {
    const out = fromCheck("runs", "log_run", { status: "ready", resolved, fields: [["Distance", "3 mi"]], warnings: [] });
    expect(out.entry).toEqual({ tool: "log_run", resolved, card: { target: "runs", title: TOOLS.log_run.display, fields: [["Distance", "3 mi"]] } });
    expect(out.unclear).toBeUndefined();
  });

  it("a warning still saves, and says so", () => {
    const out = fromCheck("weight", "log_weight", { status: "ready", resolved, fields: [], warnings: ["That's 20 lb off your last weigh-in."] });
    expect(out.entry).toBeDefined();
    expect(out.unclear).toBe("Weight: That's 20 lb off your last weigh-in.");
  });

  it("anything that needs more is sent to Chat instead of guessed", () => {
    expect(fromCheck("runs", "log_run", { status: "missing", resolved, title: "Run", missing: [{ name: "time", label: "Time" }] }))
      .toEqual({ unclear: "Runs: Run needs time. Log it in Chat with the Runs chip." });
    expect(fromCheck("nutrition", "log_saved_meal", { status: "ambiguous", options: [], title: "Which bowl?" }).unclear)
      .toBe("Food: Which bowl? Log it in Chat with the Food chip.");
    expect(fromCheck("leetcode", "log_leetcode", { status: "invalid", detail: "No problem named." })).toEqual({ unclear: "LeetCode: No problem named." });
  });
});

describe("EOD: Save EOD with tab entries", () => {
  const entry = { tool: "log_run", resolved: { miles: 3 } };
  const noDb = {} as Db; // nothing of EOD's own to save: the database isn't touched

  it("only tab entries: hands each to its tool", async () => {
    const out = await TOOLS.save_eod.commit({ date: "2026-11-13", notes: [], spending: [], answers: [], done: [], entries: [entry] }, noDb);
    expect(out).toMatchObject({ status: "saved", label: "End of day: 1 entry", actionId: null, then: [entry] });
  });

  it("drops entries for tools that don't exist", async () => {
    const out = await TOOLS.save_eod.commit({ date: "2026-11-13", entries: [{ tool: "not_a_tool", resolved: {} }] }, noDb);
    expect(out.status).toBe("failed");
  });

  it("with journals too: saves them in one transaction, then the tab entries", async () => {
    const db = { rpc: async () => ({ data: { status: "saved", saved: [{ table: "notes", row: { kind: "journal", body: "shipped" }, action_id: "a1" }] }, error: null }) } as unknown as Db;
    const out = await TOOLS.save_eod.commit({ date: "2026-11-13", notes: [{ kind: "journal", body: "shipped" }], entries: [entry] }, db);
    expect(out).toMatchObject({ status: "saved", label: "Work journal: shipped", actionId: "a1", then: [entry] });
  });
});
