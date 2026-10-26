// The portfolio's content, as its JSON Schemas define it (the API enforces them). No IDs:
// projects and cards are found by title, timeline months by monthLabel.

export type FileName = "projects" | "timeline" | "cards";
export const FILES: FileName[] = ["projects", "timeline", "cards"];

export const PROJECT_TAGS = ["Full-Stack", "ML", "Data Science", "CV", "NLP"] as const;
export const CARD_SECTIONS = ["experience", "certification"] as const;
export const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4}$/;

export interface Project {
  title: string;
  dateRange?: string;
  bullets: string[]; // bullets[0] is the one-line summary on the card
  metrics?: string[];
  skills: string[];
  tags: string[];
  repoUrl?: string;
  hidden?: boolean;
}

export interface TimelineMonth {
  monthLabel: string; // "Feb 2026"
  employer?: string[];
  courses?: string[];
  certs?: string[];
  projects?: string[];
  hidden?: boolean;
}

export interface Card {
  section: (typeof CARD_SECTIONS)[number];
  title: string; // "Role @ Company"
  logo: string; // "" or "assets/<file>"
  bullets: string[];
  skills: string[];
  hidden?: boolean;
}

export type Item = Project | TimelineMonth | Card;
export const keyOf = (file: FileName) => (file === "timeline" ? "monthLabel" : "title");

/** Lenient title comparison: look-alike dashes, odd spaces and case don't matter. */
export const normalizeTitle = (s: string) =>
  s.normalize("NFKC").replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** Index of exactly one item whose key matches, or an error listing the candidates. */
export function findOne<T>(items: T[], key: keyof T, wanted: string): number {
  const hits = items.flatMap((it, i) => (normalizeTitle(String(it[key])) === normalizeTitle(wanted) ? [i] : []));
  if (hits.length === 1) return hits[0];
  const names = items.map((it) => String(it[key])).join(" | ");
  throw new Error(hits.length ? `"${wanted}" matches ${hits.length} items.` : `No item "${wanted}". Existing: ${names}`);
}
