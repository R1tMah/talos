import { describe, expect, it } from "vitest";
import { commuteLeg, parseFeed } from "@/lib/watch/adapters";
import { jobMatches } from "@/lib/watch/match";
import { companyKey } from "@/lib/watch/data";
import type { TransitConfig } from "@/lib/watch/types";

describe("Watch: feed parsing", () => {
  it("reads RSS titles and links, never the body", () => {
    const xml = `<rss><channel><title>The Verge</title>
      <item><title><![CDATA[Etsy &amp; AI listings]]></title><link>https://theverge.com/a</link>
        <description>Long body that must not be kept</description><pubDate>Thu, 23 Oct 2026 04:00:00 GMT</pubDate></item>
      <item><title>No link here</title></item>
    </channel></rss>`;
    expect(parseFeed(xml, "https://theverge.com/rss")).toEqual([
      { title: "Etsy & AI listings", url: "https://theverge.com/a", source: "The Verge", at: "2026-10-23T04:00:00.000Z" },
    ]);
  });

  it("reads Atom entries", () => {
    const xml = `<feed><title>Ars</title><entry><title>Starship</title><link rel="alternate" href="https://arstechnica.com/s"/>
      <updated>2026-10-22T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml, "https://arstechnica.com/feed")[0]).toMatchObject({ title: "Starship", url: "https://arstechnica.com/s", source: "Ars" });
  });
});

describe("Watch: job filters", () => {
  const job = { title: "Software Engineer, New Grad", locations: ["Boston, MA", "NYC"], category: "Software" };
  it("empty filters match anything", () => {
    expect(jobMatches(job, { categories: [], locations: [], exclude: [] })).toBe(true);
  });
  it("roles, places and exclusions are case-insensitive", () => {
    expect(jobMatches(job, { categories: ["software"], locations: ["boston"], exclude: [] })).toBe(true);
    expect(jobMatches(job, { categories: ["Quant"], locations: [], exclude: [] })).toBe(false);
    expect(jobMatches(job, { categories: [], locations: ["Seattle"], exclude: [] })).toBe(false);
    expect(jobMatches(job, { categories: [], locations: [], exclude: ["new grad"] })).toBe(false);
  });
  it("company names compare loosely for the Applied flag", () => {
    expect(companyKey("Google LLC")).toBe(companyKey("google"));
    expect(companyKey("Jane Street Capital")).not.toBe(companyKey("Jane Street"));
  });
});

describe("Watch: commute direction", () => {
  const c = {
    timezone: "America/New_York", switch_at: "12:00",
    before_switch: { label: "To Government Center", board_stop: "Packard's Corner", destination: "Government Center" },
    after_switch: { label: "To Boston College", board_stop: "Government Center", destination: "Boston College" },
  } as TransitConfig;
  it("switches at noon Boston time, whatever the phone's timezone", () => {
    expect(commuteLeg(c, new Date("2026-10-23T15:59:00Z"), false).label).toBe("To Government Center"); // 11:59 EDT
    expect(commuteLeg(c, new Date("2026-10-23T16:00:00Z"), false).label).toBe("To Boston College"); // 12:00 EDT
  });
  it("the flip button swaps it", () => {
    expect(commuteLeg(c, new Date("2026-10-23T13:00:00Z"), true).label).toBe("To Boston College");
    expect(commuteLeg(c, new Date("2026-10-23T20:00:00Z"), true).label).toBe("To Government Center");
  });
});

describe("Watch: SimplifyJobs README rules", async () => {
  const { onNewGradList, isOpen, categoryOf, categoryName } = await import("@/lib/watch/simplify");
  const at = (iso: string) => Date.parse(iso) / 1000;
  const base = { is_visible: true, date_posted: at("2026-10-01"), company_url: "https://simplify.jobs/c/Acme", category: "Software" };

  it("scraped postings need a new-grad title; community ones are always listed", () => {
    expect(onNewGradList({ ...base, source: "Simplify", title: "Software Engineer" })).toBe(false);
    expect(onNewGradList({ ...base, source: "Simplify", title: "Software Engineer, New Grad" })).toBe(true);
    expect(onNewGradList({ ...base, source: "Simplify", title: "Software Engineer I" })).toBe(true);
    expect(onNewGradList({ ...base, source: "someuser", title: "Member of Technical Staff" })).toBe(true);
  });

  it("drops hidden, pre-June-2025 and blocked-company postings", () => {
    expect(onNewGradList({ ...base, source: "x", title: "SWE", is_visible: false })).toBe(false);
    expect(onNewGradList({ ...base, source: "x", title: "SWE", date_posted: at("2025-05-01") })).toBe(false);
    expect(onNewGradList({ ...base, source: "x", title: "SWE", company_url: "https://simplify.jobs/c/Jerry" })).toBe(false);
  });

  it("community postings close after four months", () => {
    const now = Date.parse("2026-10-23");
    expect(isOpen({ ...base, source: "someuser", title: "SWE", active: true, date_posted: at("2026-06-16") }, now)).toBe(false);
    expect(isOpen({ ...base, source: "someuser", title: "SWE", active: true, date_posted: at("2026-07-01") }, now)).toBe(true);
    expect(isOpen({ ...base, source: "Simplify", title: "SWE", active: true, date_posted: at("2025-07-01") }, now)).toBe(true);
  });

  it("files postings under the README's sections", () => {
    expect(categoryOf({ title: "x", category: "AI/ML/Data" })).toBe("Data Science, AI & Machine Learning");
    expect(categoryOf({ title: "FPGA Engineer", category: null })).toBe("Hardware Engineering");
    expect(categoryName("Software")).toBe("Software Engineering");
    expect(jobMatches({ title: "x", locations: [], category: "Software Engineering" }, { categories: ["Software"], locations: [], exclude: [] })).toBe(true);
  });
});

describe("Watch: US-only and degree filters", async () => {
  const { isUSLocation, needsGradDegree } = await import("@/lib/watch/match");
  it("knows US places in the list's formats", () => {
    for (const l of ["San Jose, CA", "NYC", "SF", "LA", "Remote in USA", "United States", "Texas", "Washington, DC"]) expect(isUSLocation(l), l).toBe(true);
    for (const l of ["London, UK", "Toronto, ON, Canada", "Remote in Canada", "Europe", "Netherlands"]) expect(isUSLocation(l), l).toBe(false);
  });
  it("leaves out roles that need a grad degree, keeps ones that accept a Bachelor's", () => {
    expect(needsGradDegree({ title: "Research Scientist", degrees: ["PhD"] })).toBe(true);
    expect(needsGradDegree({ title: "ML Engineer", degrees: ["Master's", "PhD"] })).toBe(true);
    expect(needsGradDegree({ title: "Software Engineer, PhD New Grad", degrees: [] })).toBe(true);
    expect(needsGradDegree({ title: "Software Engineer", degrees: ["Bachelor's", "Master's"] })).toBe(false);
    expect(needsGradDegree({ title: "Software Engineer", degrees: [] })).toBe(false);
  });
});
