// Tab groups (Journals, Recruiting) and where moved tabs live now, with links and redirects that agree.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ARCHIVABLE } from "@/lib/tabs";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("redirect"), { to });
  },
}));
const { GROUPS, groupHref, groupTab } = await import("@/lib/tabGroups");

/** Where a redirect page sends you, for the given query. */
async function lands(page: string, query: Record<string, string> = {}) {
  const mod = (await import(page)) as { default: (p: { searchParams: Promise<Record<string, string>> }) => unknown };
  try {
    await mod.default({ searchParams: Promise.resolve(query) });
  } catch (e) {
    return (e as { to?: string }).to;
  }
  return null;
}

describe("tab groups", () => {
  it("Journals is Personal, Work, Content (Long Term is its own page); Recruiting is Applications, Callbacks", () => {
    expect(GROUPS.journals.map((t) => t.tab)).toEqual(["personal", "work", "content"]);
    expect(GROUPS.recruiting.map((t) => t.tab)).toEqual(["applications", "callbacks"]);
    expect(GROUPS.interviews.map((t) => t.tab)).toEqual(["leetcode", "system-design", "ai-assisted"]);
  });

  it("reads only the group's own tab names from the URL", () => {
    expect(groupTab("journals", "work")).toBe("work");
    expect(groupTab("journals", "journal")).toBeNull(); // the tab key isn't the URL name
    expect(groupTab("recruiting", "callbacks")).toBe("callbacks");
    expect(groupTab("recruiting", "work")).toBeNull();
    expect(groupTab("recruiting", ["callbacks"])).toBeNull();
  });

  it("the Archived list links each grouped tab to its group page", () => {
    for (const [group, tabs] of Object.entries(GROUPS) as [keyof typeof GROUPS, (typeof GROUPS)[keyof typeof GROUPS]][]) {
      for (const t of tabs) expect(ARCHIVABLE.find((a) => a.key === t.key)?.href).toBe(groupHref(group, t.key));
    }
  });
});

describe("old addresses redirect", () => {
  it("each moved notepad and page lands on its tab", async () => {
    expect(await lands("@/app/tabs/content/page")).toBe("/tabs/journals?tab=content");
    expect(await lands("@/app/tabs/journal/page")).toBe("/tabs/journals?tab=work");
    expect(await lands("@/app/tabs/personal/page")).toBe("/tabs/journals?tab=personal");
    expect(await lands("@/app/tabs/callbacks/page")).toBe("/tabs/recruiting?tab=callbacks");
    expect(await lands("@/app/tabs/talos/page")).toBe("/settings/talos");
  });

  it("Applications keeps Watch's prefill when it redirects", async () => {
    const to = await lands("@/app/tabs/applications/page", { add: "1", company: "Acme, Inc.", position: "SWE Intern" });
    const url = new URL(to!, "http://x");
    expect(url.pathname).toBe("/tabs/recruiting");
    expect(Object.fromEntries(url.searchParams)).toEqual({ add: "1", company: "Acme, Inc.", position: "SWE Intern", tab: "applications" });
  });

  it("Watch's Add link and the debrief's way back point at Recruiting", () => {
    expect(readFileSync("components/watch/Jobs.tsx", "utf8")).toContain('`/tabs/recruiting?${new URLSearchParams({ tab: "applications", add: "1"');
    const debrief = readFileSync("app/tabs/callbacks/[id]/page.tsx", "utf8");
    expect(debrief).not.toContain('"/tabs/callbacks"');
    expect(debrief).toContain('router.push("/tabs/recruiting?tab=callbacks")');
  });

  it("Talos Improvements lives in Settings", () => {
    expect(ARCHIVABLE.find((t) => t.key === "talos")?.href).toBe("/settings/talos");
    expect(readFileSync("app/settings/page.tsx", "utf8")).toContain('href="/settings/talos"');
  });
});

describe("server pages only call server-safe code", () => {
  // A "use client" module's functions can't be called during a server render (Next only
  // enforces this at runtime). These pages call groupTab()/FLAGS on the server.
  const isClient = (file: string) => /^\s*["']use client["']/.test(readFileSync(file, "utf8"));
  it.each([
    ["app/tabs/journals/page.tsx", "lib/tabGroups.ts"],
    ["app/tabs/recruiting/page.tsx", "lib/tabGroups.ts"],
    ["app/finances/layout.tsx", "lib/flags.ts"],
  ])("%s calls into %s, which isn't client-only", (page, lib) => {
    expect(isClient(page)).toBe(false);
    expect(isClient(lib)).toBe(false);
  });
});
