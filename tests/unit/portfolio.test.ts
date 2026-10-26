// Portfolio: the editor-API client (read → change → save, conflicts, validation errors),
// title matching, cleaning items, and the chat tools (always asked first, owner's words only).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);

import { run } from "@/lib/agent/run";
import { monthLabelFrom } from "@/lib/agent/tools";
import { PortfolioValidationError, updateContent } from "@/lib/portfolio/client";
import { clean, setHidden } from "@/lib/portfolio/ops";
import { findOne } from "@/lib/portfolio/types";
import { ctxFor, fakeDb, proposals } from "../helpers/fakeDb";
import { model } from "../helpers/model";

const env = { PORTFOLIO_BASE_URL: "https://site.example", PORTFOLIO_ADMIN_USER: "me", PORTFOLIO_ADMIN_PASSWORD: "pw" };

/** A fake editor API holding files in memory; versions bump on every save. */
function fakeSite(files: Record<string, unknown[]>, opts: { conflictOnce?: boolean; reject?: string[] } = {}) {
  const versions: Record<string, number> = {};
  const puts: { file: string; items: unknown[] }[] = [];
  let conflicted = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const file = new URL(url).pathname.split("/").pop()!;
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
    if (!init.method || init.method === "GET") return json(200, { items: files[file], version: String(versions[file] ?? 0) });
    const body = JSON.parse(String(init.body)) as { items: unknown[]; version: string };
    if (opts.reject) return json(422, { error: "invalid content", errors: opts.reject });
    if (opts.conflictOnce && !conflicted) {
      conflicted = true;
      files[file] = [...files[file], { title: "Added elsewhere", bullets: [], skills: [], tags: [] }];
      versions[file] = (versions[file] ?? 0) + 1;
      return json(409, { error: "conflict" });
    }
    if (body.version !== String(versions[file] ?? 0)) return json(409, { error: "conflict" });
    files[file] = body.items;
    versions[file] = (versions[file] ?? 0) + 1;
    puts.push({ file, items: body.items });
    return json(200, { ok: true, version: String(versions[file]) });
  }));
  return { files, puts };
}

beforeEach(() => Object.assign(process.env, env));
afterEach(() => vi.unstubAllGlobals());

describe("saving", () => {
  it("re-reads and re-applies when someone else saved in between, losing nothing", async () => {
    const site = fakeSite({ projects: [{ title: "Old", bullets: [], skills: [], tags: [] }] }, { conflictOnce: true });
    await updateContent<{ title: string }>("projects", (items) => [{ title: "New" } as never, ...items]);
    expect((site.files.projects as { title: string }[]).map((p) => p.title)).toEqual(["New", "Old", "Added elsewhere"]);
  });
  it("validation errors come back as the site's own sentences", async () => {
    fakeSite({ projects: [] }, { reject: ['projects.json[0].tags[0]: "AI" is not one of …'] });
    await expect(updateContent("projects", (x) => x)).rejects.toBeInstanceOf(PortfolioValidationError);
    await expect(updateContent("projects", (x) => x)).rejects.toThrow(/"AI" is not one of/);
  });
  it("hiding keeps the item and showing removes the flag", async () => {
    const site = fakeSite({ cards: [{ section: "experience", title: "SWE @ Acme", logo: "", bullets: [], skills: [] }] });
    await setHidden("cards", "swe @ acme", true);
    expect(site.files.cards[0]).toMatchObject({ title: "SWE @ Acme", hidden: true });
    await setHidden("cards", "SWE @ Acme", false);
    expect(site.files.cards[0]).not.toHaveProperty("hidden");
  });
  it("isn't set up without the env vars", async () => {
    delete process.env.PORTFOLIO_BASE_URL;
    await expect(updateContent("projects", (x) => x)).rejects.toThrow(/isn't set up/);
  });
});

describe("matching and cleaning", () => {
  it("matches titles across look-alike dashes, spacing and case, and lists candidates when it can't", () => {
    const items = [{ title: "Analysis of Document Q‑A on SQuAD" }, { title: "Talos" }];
    expect(findOne(items, "title", "analysis of document  q-a on squad")).toBe(0);
    expect(() => findOne(items, "title", "Nope")).toThrow(/Existing: Analysis.*\| Talos/);
  });
  it("drops blank optional fields and empty timeline lists", () => {
    expect(clean("projects", { title: " T ", bullets: ["a", " "], skills: [], tags: [], dateRange: "", repoUrl: " ", metrics: [] }))
      .toEqual({ title: "T", bullets: ["a"], skills: [], tags: [] });
    expect(clean("timeline", { monthLabel: "Oct 2026", employer: ["Flexcar"], courses: [], hidden: false })).toEqual({ monthLabel: "Oct 2026", employer: ["Flexcar"] });
  });
  it.each([
    ["Oct 2026", "Oct 2026"], ["february 2027", "Feb 2027"], ["Sept '26", "Sep 2026"], ["june", "Jun 2026"],
  ])("month %s -> %s", (t, want) => expect(monthLabelFrom(t, "2026-10-25")).toBe(want));
});

describe("chat", () => {
  beforeEach(() => model.reset());
  const send = async (text: string, name: string, input: Record<string, unknown>) => {
    model.toolCalls({ name, input: { confidence: 0.95, ...input } });
    const f = fakeDb();
    return run(ctxFor(text, f.db), 0.85, proposals().propose);
  };

  it("adding a project always asks first, and leaves out words the owner didn't write", async () => {
    const site = fakeSite({ projects: [] });
    const r = await send("add Talos to my portfolio: personal tracking PWA, Next.js, Supabase, full stack", "portfolio_add_project", {
      title: "Talos", bullets: ["personal tracking PWA", "A beautifully crafted app"], skills: ["Next.js", "Supabase"], tags: ["Full-Stack", "ML"],
      date_range: null, repo_url: null,
    });
    expect(r.cards[0].kind).toBe("warning");
    const detail = (r.cards[0] as { detail: string }).detail;
    expect(detail).toMatch(/^Add “Talos” to the top of your public portfolio's Projects \(Next\.js, Supabase\)\?/);
    expect(detail).toContain("Left out (not in your words): “A beautifully crafted app”");
    expect(site.puts).toEqual([]); // nothing published yet
  });

  it("a timeline month that already has entries says it replaces them", async () => {
    fakeSite({ timeline: [{ monthLabel: "Oct 2026", courses: ["NLP"] }] });
    const r = await send("portfolio timeline Oct 2026: SWE Intern at Flexcar", "portfolio_set_timeline_month", {
      month_text: "Oct 2026", employer: ["SWE Intern at Flexcar"], courses: [], certs: [], projects: [],
    });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/Set Oct 2026 .*SWE Intern at Flexcar\? This replaces what's on Oct 2026 now\./);
  });

  it("hiding an item it can't find lists what's there", async () => {
    fakeSite({ projects: [{ title: "Talos", bullets: [], skills: [], tags: [] }] });
    const r = await send("hide blackjack from my portfolio", "portfolio_set_hidden", { file: "projects", match: "blackjack", hidden: true });
    expect(r.cards[0]).toMatchObject({ kind: "failed" });
    expect((r.cards[0] as { detail: string }).detail).toMatch(/No item "blackjack". Existing: Talos/);
  });
});
