// Lifts from Liftoff: the pasted CSV parsed and checked by code, the 1RM math, the split,
// and the chat route (no model) with its confirm card.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { commitCard, run } from "@/lib/agent/run";
import { BIG_THREE, dayOf, e1rm, importSummary, isLiftoffCsv, parseLiftoff, sessions, sessionsFor, setText, shortDuration, splitOf } from "@/lib/liftoff";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const HEAD = "Date,Duration,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE,Notes";
const CSV = [
  HEAD,
  "2026-11-03 18:22:10,1h 5m,Push,Incline Dumbbell Bench Press,1,65,10,,,8,",
  "2026-11-03 18:22:10,1h 5m,Push,Incline Dumbbell Bench Press,2,70,8,,,9,\"felt strong, PR\"",
  "2026-11-03 18:22:10,1h 5m,Push,Cable Fly,1,30,12,,,,",
  "2026-11-04 17:00:00,58m,Pull,Seated Hammer Curl,1,35,10,,,,",
  "2026-11-04 17:00:00,58m,Pull,Hammer Curl,2,40,8,,,,",
  "2026-11-04 17:00:00,58m,Pull,Captain's Chair Leg Raise,1,0,15,,,,",
  "",
].join("\n");

describe("spotting a Liftoff export", () => {
  it("by its header, wherever the paste starts", () => {
    expect(isLiftoffCsv(CSV)).toBe(true);
    expect(isLiftoffCsv(`\n\n${CSV}`)).toBe(true);
    expect(isLiftoffCsv(`﻿${CSV}`)).toBe(true);
    expect(isLiftoffCsv("had chicken and rice 600 cal")).toBe(false);
    expect(isLiftoffCsv("Date,Weight\n2026-11-03,168")).toBe(false);
  });
});

describe("parsing", () => {
  it("every set, with quoted notes kept whole", () => {
    const { sets, errors } = parseLiftoff(CSV);
    expect(errors).toEqual([]);
    expect(sets).toHaveLength(6);
    expect(sets[1]).toMatchObject({ date: "2026-11-03", started: "2026-11-03 18:22:10", duration: "1h 5m", workout: "Push", exercise: "Incline Dumbbell Bench Press", order: 2, weight: 70, reps: 8, rpe: 9, notes: "felt strong, PR" });
    expect(sets[2]).toMatchObject({ rpe: null, notes: null, distance: null });
  });

  it("notes with a line break inside quotes", () => {
    const { sets, errors } = parseLiftoff(`${HEAD}\n2026-11-03,1h,Push,Cable Fly,1,30,12,,,,"left shoulder\ntight"\n`);
    expect(errors).toEqual([]);
    expect(sets[0].notes).toBe("left shoulder\ntight");
  });

  it.each([
    ["2026-11-03", "2026-11-03"],
    ["2026-11-03 18:22:10", "2026-11-03"],
    ["2026-11-03T18:22:10Z", "2026-11-03"],
    ["11/3/2026", "2026-11-03"],
    ["11/3/26 6:22 PM", "2026-11-03"],
    ["Nov 3, 2026 6:22 PM", "2026-11-03"],
    ["2026-02-30", null],
    ["yesterday", null],
  ])("date %s -> %s", (cell, want) => expect(dayOf(cell)).toBe(want));

  it("any bad line stops the import and is named by its line", () => {
    const bad = [HEAD, "2026-11-03,1h,Push,Cable Fly,1,30,12x,,,,", "not a date,1h,Push,Cable Fly,2,30,12,,,,", "2026-11-03,1h,Push,,3,30,12,,,,"].join("\n");
    const { sets, errors } = parseLiftoff(bad);
    expect(errors).toEqual(['Line 2: Reps isn\'t a number.', 'Line 3: Date "not a date" isn\'t a date.', "Line 4: Exercise Name is empty."]);
    // All three lines are bad, so no sets come back (and with any error, nothing is saved).
    expect(sets).toHaveLength(0);
  });

  it("a header with nothing under it", () => {
    expect(parseLiftoff(HEAD).errors).toEqual(["There are no sets under the header."]);
  });
});

// Straight from a real Liftoff export: no Workout Names, "NN hours NN minutes NN seconds"
// durations, Set Order from 0, zeros for distance and seconds, quoted notes (one of them
// just a line break), a workout listed twice, and one listed twice a second apart.
const REAL = `${HEAD}
2026-08-25 19:11:32,00 hours 42 minutes 27 seconds,,Cable Fly,0,15,9,0,0,,
2026-08-25 19:11:32,00 hours 42 minutes 27 seconds,,Incline Bench Press,0,110,6,0,0,,
2026-09-25 21:07:09,00 hours 53 minutes 58 seconds,,Chest Supported Dumbbell Row,0,50,9,0,0,,"do this on 4 incline "
2026-09-25 21:07:09,00 hours 53 minutes 58 seconds,,Seated Hammer Curl,0,45,7,0,0,,
2026-09-29 19:33:29,00 hours 46 minutes 03 seconds,,Dumbbell Calf Raise,0,70,7,0,0,,"
"
2026-09-29 19:33:29,00 hours 46 minutes 03 seconds,,Hack Squat,0,305,8,0,0,,
2026-10-16 17:58:27,01 hours 32 minutes 50 seconds,,Lat Pulldown,0,140,7,0,0,,
2026-10-16 17:58:27,01 hours 32 minutes 50 seconds,,Lat Pulldown,1,130,2,0,0,,
2026-10-16 17:58:27,01 hours 32 minutes 50 seconds,,Lat Pulldown,0,140,7,0,0,,
2026-10-16 17:58:27,01 hours 32 minutes 50 seconds,,Lat Pulldown,1,130,2,0,0,,
2026-10-21 20:30:18,01 hours 31 minutes 09 seconds,,Hack Squat,0,395,7,0,0,,
2026-10-21 20:30:18,01 hours 31 minutes 10 seconds,,Hack Squat,0,395,7,0,0,,
2026-10-29 21:31:04,01 hours 29 minutes 17 seconds,,Hack Squat,0,425,7,0,0,,"425 is 3 plates and a 25 on each side "
`;

describe("a real Liftoff export", () => {
  it("parses with no errors", () => expect(parseLiftoff(REAL).errors).toEqual([]));

  it("names each workout for its split when Liftoff leaves the name empty", () => {
    const { sets } = parseLiftoff(REAL);
    const name = (started: string) => sets.find((s) => s.started === started)!.workout;
    expect(name("2026-08-25 19:11:32")).toBe("Push");
    expect(name("2026-09-25 21:07:09")).toBe("Pull");
    expect(name("2026-09-29 19:33:29")).toBe("Legs");
  });

  it("a workout listed twice counts its sets once", () => {
    const { sets } = parseLiftoff(REAL);
    expect(sets.filter((s) => s.started === "2026-10-16 17:58:27")).toHaveLength(2);
    expect(sets.filter((s) => s.started === "2026-10-21 20:30:18")).toHaveLength(1);
    expect(sets).toHaveLength(10);
  });

  it("keeps notes as written, and a note that's only a line break is no note", () => {
    const { sets } = parseLiftoff(REAL);
    expect(sets.find((s) => s.exercise === "Chest Supported Dumbbell Row")!.notes).toBe("do this on 4 incline");
    expect(sets.find((s) => s.exercise === "Dumbbell Calf Raise")!.notes).toBeNull();
    expect(sets.find((s) => s.started === "2026-10-29 21:31:04")!.notes).toBe("425 is 3 plates and a 25 on each side");
  });

  it("Hack Squat's trend runs through every Legs day", () => {
    const { sets } = parseLiftoff(REAL);
    expect(sessionsFor(sets, ["Hack Squat"]).map((p) => p.e1rm)).toEqual([386.3, 487.2, 524.2]);
  });

  it("the import summary", () => {
    const { sets } = parseLiftoff(REAL);
    expect(importSummary(sets, 2, (d) => d).text).toBe("6 workouts, 10 sets, 2026-08-25 to 2026-10-29. Replaces 2 already imported (same start time).");
  });

  it.each([
    ["00 hours 42 minutes 27 seconds", "42m"],
    ["01 hours 19 minutes 36 seconds", "1h 19m"],
    ["1h 5m", "1h 5m"],
    [null, null],
  ])("duration %s -> %s", (d, want) => expect(shortDuration(d)).toBe(want));
});

describe("estimated 1RM (Epley)", () => {
  it("weight × (1 + reps / 30), only with weight and reps", () => {
    expect(e1rm(70, 8)).toBe(88.7);
    expect(e1rm(100, 1)).toBe(103.3);
    expect(e1rm(0, 15)).toBeNull();
    expect(e1rm(100, 0)).toBeNull();
    expect(e1rm(null, 10)).toBeNull();
  });

  it("one point per session: its best set", () => {
    const { sets } = parseLiftoff(CSV);
    expect(sessionsFor(sets, ["Incline Dumbbell Bench Press"])).toEqual([
      { date: "2026-11-03", workout: "Push", e1rm: 88.7, best: "70 × 8", exercise: "Incline Dumbbell Bench Press" },
    ]);
  });

  it("Hammer Curls counts all three curl variations as one lift", () => {
    const { sets } = parseLiftoff(CSV);
    const hammer = BIG_THREE.find((b) => b.key === "hammer")!;
    const pts = sessionsFor(sets, hammer.names);
    expect(pts).toHaveLength(1);
    // Seated 35 × 10 = 46.7; Hammer Curl 40 × 8 = 50.7: the session's best.
    expect(pts[0]).toMatchObject({ e1rm: 50.7, exercise: "Hammer Curl" });
  });

  it("bodyweight sets have no 1RM", () => {
    const { sets } = parseLiftoff(CSV);
    expect(sessionsFor(sets, ["Captain's Chair Leg Raise"])).toEqual([]);
  });
});

describe("the split", () => {
  it.each([
    ["Incline Dumbbell Bench Press", "Push"],
    ["seated hammer curl", "Pull"],
    ["Hack Squat", "Legs"],
    ["Cable Crunch", "Legs"],
    ["Bulgarian Split Squat", null],
  ])("%s -> %s", (name, want) => expect(splitOf(name)).toBe(want));
});

describe("history", () => {
  it("sessions newest first, exercises in order, sets by Set Order", () => {
    const { sets } = parseLiftoff(CSV);
    const s = sessions(sets);
    expect(s.map((x) => x.workout)).toEqual(["Pull", "Push"]);
    expect(s[1].exercises.map((e) => [e.name, e.sets.map(setText).join(" · ")])).toEqual([
      ["Incline Dumbbell Bench Press", "65 × 10 · 70 × 8"],
      ["Cable Fly", "30 × 12"],
    ]);
    expect(setText({ weight: 0, reps: 15, distance: null, seconds: null })).toBe("BW × 15");
  });
});

describe("pasted into chat", () => {
  beforeEach(() => model.reset());

  it("goes to the Lifts import without the model, and asks first with a summary", async () => {
    const f = fakeDb({ tables: { workout_log: [{ started: "2026-11-03 18:22:10", workout_name: "Push", deleted_at: null }] } });
    const p = proposals();
    const r = await run(ctxFor(CSV, f.db), 0.85, p.propose);
    expect(r.route).toBe("rule");
    expect(r.calls[0].name).toBe("import_liftoff");
    expect(r.cards[0]).toMatchObject({ kind: "warning", title: "Import these workouts?", action: "Import" });
    const card = r.cards[0] as { detail: string };
    expect(card.detail).toContain("2 workouts, 6 sets, Nov 3 to Nov 4");
    expect(card.detail).toContain("Replaces 1 already imported");
    expect(f.writes()).toEqual([]);
  });

  it("with a tab chip picked, still the import", async () => {
    const f = fakeDb();
    const r = await run(ctxFor(CSV, f.db, { tab: "nutrition" }), 0.85, proposals().propose);
    expect(r.calls[0].name).toBe("import_liftoff");
  });

  it("a bad line is a failed card that names it, and nothing is proposed", async () => {
    const f = fakeDb();
    const p = proposals();
    const r = await run(ctxFor(`${HEAD}\n2026-11-03,1h,Push,Cable Fly,1,thirty,12,,,,`, f.db), 0.85, p.propose);
    expect(r.cards[0]).toMatchObject({ kind: "failed" });
    expect((r.cards[0] as { detail: string }).detail).toContain("Line 2: Weight isn't a number.");
    expect(p.stored.size).toBe(0);
  });

  it("confirming saves every set in one call", async () => {
    const f = fakeDb({ rpc: { import_liftoff: () => ({ status: "saved", sessions: 2, replaced: 1, sets: 6 }) } });
    const { sets } = parseLiftoff(CSV);
    const cards = await commitCard("import_liftoff", { sets: sets as never }, { db: f.db, archived: new Set() }, proposals().propose);
    expect(cards).toEqual([{ kind: "saved", label: "Lifts: 2 workouts, 6 sets (1 replaced)", actionId: null }]);
    expect(f.writes()).toHaveLength(1);
    expect((f.writes()[0].args.p_sets as unknown[]).length).toBe(6);
  });
});

describe("bodyweight exercises chart their reps", () => {
  it("one point per session: the most reps in a set", async () => {
    const { repsFor } = await import("@/lib/liftoff");
    const { sets } = parseLiftoff(CSV);
    expect(repsFor(sets, ["Captain's Chair Leg Raise"])).toEqual([
      { date: "2026-11-04", workout: "Pull", e1rm: 15, best: "BW × 15", exercise: "Captain's Chair Leg Raise" },
    ]);
  });
});
