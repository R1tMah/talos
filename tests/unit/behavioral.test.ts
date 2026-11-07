// Behavioral mocks: the parts that are code, not model. The Yap Penalty, the final score,
// the copied scorecard and second-opinion prompt, and the tab's place in the app.

import { describe, expect, it } from "vitest";
import { areasFor, BUCKETS, mockName, clampTarget, externalPrompt, finalScore, FIT_AREA, fmtClock, mockScorecard, overall, scorecard, yapPenalty, type Graded } from "@/lib/mock/score";
import { CHAT_TABS, ARCHIVABLE } from "@/lib/tabs";
import { GROUPS, groupTab } from "@/lib/tabGroups";

describe("the Yap Penalty (from the timer, never the model)", () => {
  it.each([
    [100, 120, 0, "under the target"],
    [120, 120, 0, "exactly on it"],
    [134, 120, 0, "14s over: not a full 15"],
    [135, 120, 1, "15s over"],
    [155, 120, 2, "35s over"],
    [165, 120, 3, "45s over"],
    [400, 120, 3, "capped at 3"],
    [134.9, 120, 0, "fractions of a second don't count"],
  ])("%ss against %ss -> -%s (%s)", (d, t, want) => expect(yapPenalty(d, t)).toBe(want));

  it("comes off the content score, never below 0", () => {
    expect(finalScore(8, 2)).toBe(6);
    expect(finalScore(1, 3)).toBe(0);
    expect(finalScore(10, 0)).toBe(10);
  });
});

describe("what the Architect may ask for", () => {
  it.each([[120, 120], [30, 60], [900, 300], ["90", 90], [null, 120], [Number.NaN, 120]])("target %s -> %s", (v, want) => expect(clampTarget(v)).toBe(want));
  it("has the six areas", () => expect(BUCKETS).toHaveLength(6));
});

describe("a mock is a full round", () => {
  it("one question per area, with \"Why this company?\" last when it's on", () => {
    expect(areasFor(false)).toEqual([...BUCKETS]);
    expect(areasFor(true)).toEqual([...BUCKETS, FIT_AREA]);
    expect(areasFor(true)).toHaveLength(7);
  });

  it("the overall score is the mean of the answered questions, to one decimal", () => {
    expect(overall([6, 7, 8])).toBe(7);
    expect(overall([6, 7])).toBe(6.5);
    expect(overall([5, 6, 6])).toBe(5.7);
    expect(overall([])).toBeNull();
  });
});

const graded: Graded = {
  content: 8,
  checks: [{ requirement: "Uses STAR", met: true, note: "clear S and T" }, { requirement: "Quantifies the result", met: false, note: "" }],
  worked: "Good metrics on the result.",
  failed: "Spent 60 seconds on the Situation instead of your Action.",
  tip: "Get to what you did within 30 seconds.",
};

describe("the copied scorecard", () => {
  it("reads like the spec, with the penalty and both scores", () => {
    const md = scorecard({ n: 1, company: "Stripe", role: "Product Engineer", bucket: "Navigating Ambiguity", question: "Time you had to pivot quickly.", target: 120, duration: 155, graded });
    expect(md).toContain("**Q1: Time you had to pivot quickly.**");
    expect(md).toContain("Target Time: 120s | Your Time: 155s (Yap Penalty: -2 pts)");
    expect(md).toContain("Score: 6/10 (content 8/10)");
    expect(md).toContain("What Worked: Good metrics on the result.");
    expect(md).toContain("What Failed: Spent 60 seconds");
    expect(md).toContain("- [x] Uses STAR (clear S and T)");
    expect(md).toContain("- [ ] Quantifies the result");
  });

  it("on time: no penalty line", () => {
    const md = scorecard({ company: "Stripe", role: "PE", bucket: "Failure & Growth", question: "Q", target: 120, duration: 100, graded });
    expect(md).toContain("Target Time: 120s | Your Time: 100s\n");
    expect(md).toContain("Score: 8/10\n");
  });
});

describe("the full scorecard", () => {
  it("has the overall score, a line per question, then each answered question's card", () => {
    const md = mockScorecard({
      company: "Stripe", role: "Product Engineer", date: "Nov 7",
      questions: [
        { area: "Conflict & Disagreement", question: "A disagreement.", target: 120, duration: 155, graded },
        { area: "Failure & Growth", question: "A failure.", target: 120, duration: 100, graded },
        { area: "Navigating Ambiguity", question: "Ambiguity.", target: 120, duration: null, graded: null },
      ],
    });
    expect(md).toContain("# Behavioral mock: Stripe, Product Engineer (Nov 7)");
    expect(md).toContain("Overall: 7/10 across 2 of 3 questions");
    expect(md).toContain("- Q1 Conflict & Disagreement: 6/10 (Yap -2)");
    expect(md).toContain("- Q2 Failure & Growth: 8/10");
    expect(md).toContain("- Q3 Navigating Ambiguity: not answered");
    expect(md).toContain("**Q1: A disagreement.**");
    expect(md).toContain("**Q2: A failure.**");
    expect(md).not.toContain("**Q3:");
    expect(md.split("---")).toHaveLength(3);
  });

  it("before any answer", () => {
    const md = mockScorecard({ company: "Stripe", role: "PE", date: "Nov 7", questions: [{ area: "Failure & Growth", question: "Q", target: 120, duration: null, graded: null }] });
    expect(md).toContain("Overall: no answers graded yet");
  });
});

describe("without a company", () => {
  it("a mock is named by its role alone", () => {
    expect(mockName("Stripe", "Product Engineer")).toBe("Stripe, Product Engineer");
    expect(mockName("", "Product Engineer")).toBe("Product Engineer");
    expect(mockName("  ", "SWE")).toBe("SWE");
  });

  it("the scorecards and second-opinion prompt leave the company out cleanly", () => {
    const card = scorecard({ company: "", role: "SWE", bucket: "Failure & Growth", question: "A failure.", target: 120, duration: 100, graded });
    expect(card).toContain("SWE · Failure & Growth");
    expect(card).not.toContain(" · SWE");
    expect(mockScorecard({ company: "", role: "SWE", date: "Nov 7", questions: [] })).toContain("# Behavioral mock: SWE (Nov 7)");
    const p = externalPrompt({ company: "", role: "SWE", bucket: "Failure & Growth", question: "Q", rubric: { requirements: [], strong_signals: [], red_flags: [] }, target: 120, duration: 90, transcription: "x" });
    expect(p).toContain("Role: SWE (no specific company)");
    expect(p).not.toContain("Company and role: ,");
  });
});

describe("the second-opinion prompt", () => {
  it("carries the rubric, the timing rule and the answer, and stands on its own", () => {
    const p = externalPrompt({
      company: "Stripe", role: "Product Engineer", bucket: "Navigating Ambiguity", question: "Time you had to pivot.",
      rubric: { requirements: ["Uses STAR"], strong_signals: ["Bias for action"], red_flags: ["Blames others"] },
      target: 120, duration: 155, transcription: "So the situation was...",
    });
    for (const s of ["Stripe, Product Engineer", "- Uses STAR", "- Bias for action", "- Blames others", "120 seconds", "155 seconds", "So the situation was...", "out of 10"]) {
      expect(p).toContain(s);
    }
  });
});

describe("the tab", () => {
  it("is the fourth Interviews tab, archivable, and kept out of chat", () => {
    expect(GROUPS.interviews.map((t) => t.key)).toEqual(["leetcode", "sysdesign", "aiassisted", "behavioral"]);
    expect(groupTab("interviews", "behavioral")).toBe("behavioral");
    expect(ARCHIVABLE.some((t) => t.key === "behavioral")).toBe(true);
    expect(CHAT_TABS.some((t) => (t.key as string) === "behavioral")).toBe(false);
  });

  it("formats the clock", () => {
    expect(fmtClock(155)).toBe("2:35");
    expect(fmtClock(5)).toBe("0:05");
  });
});
