import { describe, expect, it } from "vitest";
import { draftFromAnswers, draftFromOneShot, needsModel, spendingText, type Extraction } from "@/lib/agent/eod";
import { TOOLS } from "@/lib/agent/tools";
import { eodCommand, isCancel, isEodTime, isSkip, type EodTarget } from "@/lib/eod";

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
      spending: [], unclear: [],
    });
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
      unclear: [],
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
