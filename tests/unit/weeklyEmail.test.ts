// The weekly email: when it's due, what it says, and the message Gmail gets.

import { describe, expect, it } from "vitest";
import { isDue, render, type WeeklyData } from "@/lib/email/weekly";
import { mimeMessage } from "@/lib/google/gmail";

const NY = "America/New_York";

describe("when it's due", () => {
  it.each([
    ["2026-10-25T16:59:00Z", false, "Sunday 12:59 PM EDT: not yet"],
    ["2026-10-25T17:00:00Z", true, "Sunday 1:00 PM EDT"],
    ["2026-10-25T23:45:00Z", true, "later Sunday still catches up if a tick was missed"],
    ["2026-11-01T17:30:00Z", false, "Nov 1 is after DST ends: 12:30 PM EST"],
    ["2026-11-01T18:00:00Z", true, "1:00 PM EST"],
    ["2026-10-24T17:00:00Z", false, "Saturday"],
    ["2026-10-26T05:00:00Z", false, "1 AM Monday is still Sunday by the 4 AM rule, but the clock is before 1 PM"],
  ])("%s -> %s (%s)", (iso, want) => expect(isDue(NY, null, new Date(iso)).due).toBe(want));
  it("goes out once per Sunday", () => {
    expect(isDue(NY, "2026-10-25", new Date("2026-10-25T18:00:00Z"))).toEqual({ due: false, day: "2026-10-25" });
    expect(isDue(NY, "2026-10-18", new Date("2026-10-25T18:00:00Z")).due).toBe(true);
  });
});

describe("on the owner's day and hour", () => {
  const wed8 = { day: 3, hour: 8 };
  it.each([
    ["2026-10-28T11:59:00Z", false, "Wednesday 7:59 AM EDT: not yet"],
    ["2026-10-28T12:00:00Z", true, "Wednesday 8:00 AM EDT"],
    ["2026-10-28T23:00:00Z", true, "later Wednesday catches up"],
    ["2026-10-25T17:00:00Z", false, "Sunday 1 PM is no longer the day"],
    ["2026-10-29T12:00:00Z", false, "Thursday"],
  ])("%s -> %s (%s)", (iso, want) => expect(isDue(NY, null, new Date(iso), wed8).due).toBe(want));
  it("once per send day", () => expect(isDue(NY, "2026-10-28", new Date("2026-10-28T13:00:00Z"), wed8).due).toBe(false));
});

const base: WeeklyData = { today: "2026-10-25", from: "2026-10-19", items: ["reminders", "weight", "food", "runs"] };

describe("what it says", () => {
  it("reminders are grouped overdue, this week, later, undated, then To apply", () => {
    const m = render({
      ...base,
      reminders: [
        { body: "renew passport", due: "2026-11-20" }, { body: "call landlord", due: null },
        { body: "dentist", due: "2026-10-27" }, { body: "pay rent", due: "2026-10-20" },
      ],
      toApply: [{ company: "Ramp", position: "SWE", noted: "2026-10-22" }],
    }, null);
    expect(m.subject).toBe("TALOS week of Oct 19 · 4 reminders (1 overdue)");
    const order = ["Overdue:", "pay rent", "Due this week:", "dentist", "Later:", "renew passport", "No date:", "call landlord", "To apply:", "Ramp, SWE"];
    const at = order.map((s) => m.text.indexOf(s));
    expect(at.every((x) => x >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("health has the owner's numbers and targets, nothing more", () => {
    const m = render({
      ...base, reminders: [],
      weight: { avg: 181.42, n: 5, lastAvg: 182.1 },
      food: { days: 6, avgCal: 2104.4, avgProtein: 151.6, calTarget: 2200, proteinTarget: 160, proteinDays: 2 },
      runs: { count: 2, miles: 7.1 },
    }, "https://talos.example");
    expect(m.text).toContain("Weight: 181.4 lb average over 5 days (-0.7 vs last week's 182.1)");
    expect(m.text).toContain("Calories: 2,104 a day on average (target 2,200), 6 days logged");
    expect(m.text).toContain("Protein: 152 g a day on average (target 160 g), hit on 2 of 6");
    expect(m.text).toContain("Runs: 2 for 7.1 mi");
    expect(m.text).toContain("Nothing open.");
    expect(m.text).toContain("Open TALOS: https://talos.example");
  });

  it("an empty week says so instead of showing zeros", () => {
    const m = render({ ...base, weight: { avg: null, n: 0, lastAvg: null }, food: { days: 0, avgCal: null, avgProtein: null, calTarget: 2200, proteinTarget: 160, proteinDays: 0 } }, null);
    expect(m.text).toContain("Weight: no weigh-ins this week.");
    expect(m.text).toContain("Food: nothing logged this week.");
  });

  it("the owner's words are escaped in the HTML", () => {
    const m = render({ ...base, reminders: [{ body: "fix <script> & stuff", due: null }] }, null);
    expect(m.html).toContain("fix &lt;script&gt; &amp; stuff");
    expect(m.html).not.toContain("<script>");
  });

  it("items left out aren't in the email", () => {
    const m = render({ ...base, items: ["runs"], runs: { count: 0, miles: 0 } }, null);
    expect(m.subject).toBe("TALOS week of Oct 19");
    expect(m.text).not.toContain("REMINDERS");
  });
});

describe("the new items", () => {
  it("long-term reminders coming up are listed with when they show up", () => {
    const m = render({ ...base, reminders: [], longTerm: [{ body: "renew passport", surface: "2026-11-10", due: "2026-12-01" }] }, null);
    expect(m.text).toContain("Long-term, showing up in the next 30 days:");
    expect(m.text).toContain("renew passport (shows Nov 10, due Dec 1)");
    expect(m.text).not.toContain("Nothing open.");
  });

  it("spending has the week's total and each category, biggest first", () => {
    const m = render({ ...base, items: ["spending"], spending: { total: 84.5, count: 3, byCategory: [{ category: "Groceries", amount: 60 }, { category: "Transport", amount: 24.5 }] } }, null);
    expect(m.text).toContain("MONEY");
    expect(m.text).toContain("Spent this week: $84.50 across 3:");
    expect(m.text.indexOf("Groceries: $60.00")).toBeLessThan(m.text.indexOf("Transport: $24.50"));
  });

  it("career items can go in one at a time", () => {
    const m = render({ ...base, items: ["leetcode"], leetcode: 4 }, null);
    expect(m.text).toContain("LeetCode: 4 this week");
    expect(m.text).not.toContain("Applied this week");
  });
});

describe("leaving out empty lines", () => {
  const quiet: WeeklyData = {
    ...base, items: ["reminders", "weight", "food", "runs", "calendar"],
    reminders: [], weight: { avg: null, n: 0, lastAvg: null }, runs: { count: 0, miles: 0 }, calendar: [],
    food: { days: 3, avgCal: 2000, avgProtein: 150, calTarget: 2200, proteinTarget: 160, proteinDays: 1 },
  };

  it("drops the nothing-happened lines and sections left empty, keeps the rest", () => {
    const m = render(quiet, null, { hideEmpty: true });
    expect(m.text).not.toContain("no weigh-ins");
    expect(m.text).not.toContain("Runs: none");
    expect(m.text).not.toContain("REMINDERS");
    expect(m.text).not.toContain("COMING UP");
    expect(m.text).toContain("Calories: 2,000 a day on average");
  });

  it("off by default: the empty lines are shown", () => {
    const m = render(quiet, null);
    expect(m.text).toContain("Weight: no weigh-ins this week.");
    expect(m.text).toContain("Nothing on the calendar.");
  });

  it("a week with nothing at all says so", () => {
    const m = render({ ...quiet, food: { days: 0, avgCal: null, avgProtein: null, calTarget: 2200, proteinTarget: 160, proteinDays: 0 } }, null, { hideEmpty: true });
    expect(m.text).toContain("Nothing to report this week.");
  });
});

describe("the message Gmail gets", () => {
  it("is to and from the owner, with text and HTML parts, and an encoded subject", () => {
    const raw = mimeMessage("me@gmail.com", "TALOS week of Oct 19 · 2 reminders", "hello", "<p>hello</p>");
    expect(raw).toMatch(/^To: me@gmail\.com\r\nFrom: TALOS <me@gmail\.com>\r\n/);
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("TALOS week of Oct 19 · 2 reminders").toString("base64")}?=`);
    expect(raw).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(raw).toContain("Content-Type: text/html; charset=UTF-8");
    expect(raw).toContain(Buffer.from("<p>hello</p>").toString("base64"));
  });
});
