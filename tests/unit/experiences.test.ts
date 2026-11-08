// Recommendations & Experiences: grouping, and the chat tools that add and check off items.

import { describe, expect, it } from "vitest";
import { TOOLS } from "@/lib/agent/tools";
import { byCategory, type Experience } from "@/lib/experiences";
import { ctxFor, fakeDb } from "../helpers/fakeDb";

const pending = (id: string, title: string, category = "Books", recommended_by: string | null = null) =>
  ({ id, title, category, recommended_by, status: "pending", deleted_at: null });

const dbWith = (rows: ReturnType<typeof pending>[] = []) => fakeDb({ tables: { life_experiences: rows } });

describe("byCategory", () => {
  it("groups in category order and skips empty categories", () => {
    const item = (title: string, category: Experience["category"]): Experience =>
      ({ id: title, title, category, recommendedBy: null, status: "pending", createdAt: "", completedAt: null, note: null, rating: null });
    const groups = byCategory([item("Japan", "Travel Experiences"), item("Atomic Habits", "Books"), item("Blonde", "Music")]);
    expect(groups.map((g) => g.category)).toEqual(["Books", "Music", "Travel Experiences"]);
  });
});

describe("add_experience", () => {
  const add = (text: string, input: Record<string, unknown>, db = dbWith()) =>
    TOOLS.add_experience.check!({ recommended_by: null, completed: false, confidence: 0.95, ...input }, ctxFor(text, db.db));

  it("reads the title, category and who recommended it", async () => {
    const r = await add("Add Atomic Habits to books recommended by Sarah", { title: "Atomic Habits", category: "Books", recommended_by: "Sarah" });
    expect(r).toMatchObject({ status: "ready", resolved: { mode: "add", title: "Atomic Habits", category: "Books", recommended_by: "Sarah", completed: false } });
  });

  it("asks for a category it can't map, and never invents who recommended it", async () => {
    const r = await add("add the thing Dave mentioned", { title: "the thing", category: null, recommended_by: "Jeff" });
    expect(r).toMatchObject({ status: "missing", resolved: { recommended_by: null } });
    expect(TOOLS.add_experience.fill!({ mode: "add", title: "x", category: null }, { category: "Music" })).toMatchObject({ category: "Music" });
    expect(TOOLS.add_experience.fill!({ mode: "add", title: "x", category: null }, { category: "Snacks" })).toBe("Pick a category.");
  });

  it("something already done that's on the list checks it off instead of adding a second", async () => {
    const db = dbWith([pending("e1", "Bouldering class", "Physical Hobbies", "Dave")]);
    const r = await add("I did a bouldering class, Dave recommended it", { title: "bouldering class", category: "Physical Hobbies", recommended_by: "Dave", completed: true }, db);
    expect(r).toMatchObject({ status: "ready", resolved: { mode: "complete", id: "e1" } });
  });

  it("commits an add through add_experience", async () => {
    const db = dbWith();
    await TOOLS.add_experience.commit({ mode: "add", title: "Blonde", category: "Music", recommended_by: "Sam", completed: false }, db.db);
    expect(db.writes()).toMatchObject([{ fn: "add_experience", args: { p_title: "Blonde", p_category: "Music", p_recommended_by: "Sam", p_completed: false } }]);
  });
});

describe("complete_experience", () => {
  const done = (text: string, title: string, db: ReturnType<typeof dbWith>) =>
    TOOLS.complete_experience.check!({ title, confidence: 0.95 }, ctxFor(text, db.db));

  it("matches what was finished to a pending item", async () => {
    const db = dbWith([pending("e1", "Atomic Habits"), pending("e2", "Japan trip", "Travel Experiences")]);
    expect(await done("I finished Atomic Habits", "Atomic Habits", db)).toMatchObject({ status: "ready", resolved: { mode: "complete", id: "e1" } });
    expect(await done("Checked off the Japan trip", "Japan trip", db)).toMatchObject({ status: "ready", resolved: { mode: "complete", id: "e2" } });
  });

  it("offers to log it as an experience when it isn't on the list", async () => {
    const r = await done("I finished Dune", "Dune", dbWith([pending("e1", "Atomic Habits")]));
    expect(r).toMatchObject({ status: "missing", resolved: { mode: "add", title: "Dune", completed: true } });
  });

  it("commits a check-off through complete_experience", async () => {
    const db = dbWith();
    await TOOLS.complete_experience.commit({ mode: "complete", id: "e1", title: "Atomic Habits" }, db.db);
    expect(db.writes()).toMatchObject([{ fn: "complete_experience", args: { p_id: "e1" } }]);
  });
});
