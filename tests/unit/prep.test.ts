// System Design Prep on Watch: the real curriculum, where the plan stands on a given
// day (today's session, catch-ups, next), and the session-day rhythm used for ordering.

import { describe, expect, it } from "vitest";
import curriculum from "@/lib/watch/sysdesign-curriculum.json";
import { CYCLE_DAYS, CYCLES, SESSION_OFFSETS, isSessionDay, mockPrompt, prepStatus, type Curriculum } from "@/lib/watch/prep";

const c = curriculum as unknown as Curriculum;
const start = "2026-10-26"; // a Monday
const none = new Set<number>();

describe("the curriculum file", () => {
  it("has 16 sessions in 4 weekly cycles, a mock every Sunday", () => {
    expect(c.sessions).toHaveLength(16);
    expect(c.sessions.filter((s) => s.kind === "mock").map((s) => s.session)).toEqual([4, 8, 12, 16]);
    expect(c.sessions.every((s) => s.kind === "learn" || s.mock)).toBe(true);
  });
  it("matches the rhythm Watch orders by without loading it", () => {
    expect(c.schedule.day_offsets_within_a_cycle).toEqual(SESSION_OFFSETS);
    expect(c.schedule.cycles).toBe(CYCLES);
    expect(c.schedule.cycle_length_days).toBe(CYCLE_DAYS);
    expect(c.sessions.every((s) => isSessionDay(start, addDays(start, s.day_offset)))).toBe(true);
  });
});

function addDays(d: string, n: number) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

describe("prepStatus", () => {
  it("is null until a start date is picked", () => {
    expect(prepStatus(c.sessions, "", "2026-10-26", none)).toBeNull();
  });
  it("dates sessions Mon, Wed, Fri, Sun from the start", () => {
    const st = prepStatus(c.sessions, start, "2026-10-25", none)!;
    expect(st.all.slice(0, 4).map((s) => s.date)).toEqual(["2026-10-26", "2026-10-28", "2026-10-30", "2026-11-01"]);
    expect(st.all.at(-1)!.date).toBe("2026-11-22");
    expect(st).toMatchObject({ today: null, missed: [], next: { session: 1 } });
  });
  it("shows today's session on a session day", () => {
    expect(prepStatus(c.sessions, start, "2026-11-01", new Set([1, 2, 3]))).toMatchObject({ today: { session: 4, kind: "mock" }, missed: [], done: 3 });
  });
  it("on an off day: the next session, and missed ones to catch up on", () => {
    const st = prepStatus(c.sessions, start, "2026-10-29", new Set([1]))!;
    expect(st.today).toBeNull();
    expect(st.missed.map((s) => s.session)).toEqual([2]);
    expect(st.next).toMatchObject({ session: 3, date: "2026-10-30" });
  });
});

describe("mockPrompt", () => {
  it("fills the day's prompt into the interviewer template", () => {
    const p = mockPrompt(c, c.sessions[3].mock!);
    expect(p).toContain("Design a URL shortening service");
    expect(p).not.toContain("[PASTE PROMPT]");
  });
});
