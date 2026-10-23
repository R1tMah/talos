// What the SimplifyJobs New-Grad-Positions list actually shows, ported from the repo's
// own README generator (.github/scripts/util.py: filterListings, classifyJobCategory).
// listings.json holds far more than the list: postings Simplify scraped automatically
// only make it into the README when the title reads as a new-grad role.
// Keep in step with that script if the list ever looks different from the README.

const EARLIEST_POSTED = 1748761200; // seconds; the README's cutoff (June 1, 2025)
const BLOCKED_COMPANY_URLS = ["https://simplify.jobs/c/jerry"];

const INCLUSION_TERMS = [
  "software eng", "software dev", "product engineer", "fullstack engineer", "frontend", "front end", "front-end", "backend", "back end",
  "full-stack", "full stack", "founding engineer", "mobile dev", "mobile engineer", "data scientist", "data engineer", "research eng",
  "product manag", "apm", "product", "devops", "android", "ios", "sre", "site reliability eng", "quantitative trad", "quantitative research",
  "quantitative dev", "security eng", "compiler eng", "machine learning eng", "hardware eng", "firmware eng", "infrastructure eng", "embedded",
  "fpga", "circuit", "chip", "silicon", "asic", "quant", "quantitative", "trading", "finance", "investment", "ai &", "machine learning", "ml",
  "analytics", "analyst", "research sci",
];
const NEW_GRAD_TERMS = [
  "new grad", "early career", "college grad", "entry level", "founding", "early in career", "university grad", "fresh grad", "2024 grad",
  "2025 grad", "engineer 0", "engineer 1", "engineer i ", "junior", "sde 1", "sde i",
];

export interface RawListing {
  title: string;
  source?: string;
  company_url?: string;
  category?: string | null;
  date_posted: number;
  is_visible: boolean;
}

/** Would this posting appear on the New-Grad-Positions README? (Open or closed.) */
export function onNewGradList(l: RawListing): boolean {
  if (!l.is_visible || l.date_posted <= EARLIEST_POSTED) return false;
  const url = (l.company_url ?? "").toLowerCase();
  if (BLOCKED_COMPANY_URLS.some((b) => url.includes(b))) return false;
  if (l.source !== "Simplify") return true; // submitted by the community: always listed
  const t = l.title.toLowerCase();
  return INCLUSION_TERMS.some((x) => t.includes(x)) && (NEW_GRAD_TERMS.some((x) => t.includes(x)) || t.endsWith("engineer i"));
}

const STALE_MONTHS = 4; // INACTIVE_THRESHOLD_MONTHS

/**
 * Is the posting still open, as the README shows it? Community-submitted postings
 * (not from Simplify) count as closed after four months even while the file still
 * says active (util.py mark_stale_listings: days / 30 > 4).
 */
export function isOpen(l: RawListing & { active: boolean }, now = Date.now()): boolean {
  if (!l.active) return false;
  if (l.source === "Simplify") return true;
  const days = Math.floor((now - l.date_posted * 1000) / 86_400_000);
  return days / 30 <= STALE_MONTHS;
}

export const CATEGORIES = [
  "Software Engineering", "Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management", "Hardware Engineering", "Other",
] as const;

const CATEGORY_ALIASES: [string[], (typeof CATEGORIES)[number]][] = [
  [["hardware", "hardware engineering", "embedded engineering", "embedded", "firmware", "fpga", "circuit", "chip", "silicon", "asic"], "Hardware Engineering"],
  [["quant", "quantitative finance", "quantitative", "finance", "trading", "investment", "financial"], "Quantitative Finance"],
  [["ai/ml/data", "data & analytics", "ai & machine learning", "data science", "data science, ai & machine learning", "ai", "ml", "machine learning",
    "data", "analytics", "research", "ai/ml", "data science & analytics"], "Data Science, AI & Machine Learning"],
  [["product", "product management", "pm", "apm", "product manager"], "Product Management"],
  [["software", "software engineering", "software engineer", "engineering", "swe", "dev", "developer", "backend", "frontend", "fullstack",
    "full-stack", "mobile", "web", "infrastructure", "devops", "sre"], "Software Engineering"],
  [["other", "misc", "miscellaneous"], "Other"],
];

/** A typed role filter ("Software", "AI/ML/Data", "quant") as the README section it means. */
export function categoryName(name: string): (typeof CATEGORIES)[number] | null {
  const c = name.toLowerCase().trim();
  return CATEGORY_ALIASES.find(([names]) => names.includes(c))?.[1] ?? CATEGORIES.find((x) => x.toLowerCase() === c) ?? null;
}

/** The README section a posting is listed under. */
export function categoryOf(l: Pick<RawListing, "title" | "category">): (typeof CATEGORIES)[number] {
  const c = (l.category ?? "").toLowerCase().trim();
  if (c) {
    const hit = CATEGORY_ALIASES.find(([names]) => names.includes(c));
    if (hit) return hit[1];
    const exact = CATEGORIES.find((x) => x === l.category);
    if (exact) return exact;
  }
  const t = l.title.toLowerCase();
  const has = (terms: string[]) => terms.some((x) => t.includes(x));
  if (has(["hardware", "embedded", "fpga", "circuit", "chip", "silicon", "asic", "robotics"])) return "Hardware Engineering";
  if (has(["quant", "quantitative", "trading", "finance", "investment"])) return "Quantitative Finance";
  if (has(["data science", "data scientist", "ai &", "machine learning", "ml", "data analytics", "data analyst", "research eng", "research sci"]))
    return "Data Science, AI & Machine Learning";
  if (has(["forward deployed", "forward-deployed", "software", "software eng", "software dev", "product engineer", "fullstack engineer", "frontend",
    "backend", "founding engineer", "mobile dev", "mobile engineer"])) return "Software Engineering";
  if (has(["product manag", "product analyst", "apm"]) || (t.includes("product") && t.includes("analyst"))) return "Product Management";
  return "Other";
}
