// Behavioral mocks v2: the areas a question can belong to, in the fixed order the question
// writer uses (and the trends card shows). Anything else read from a paste becomes "other".

export const AREA_ORDER = ["conflict", "failure", "ambiguity", "leadership", "ownership", "teamwork", "why_company"] as const;
export type NamedArea = (typeof AREA_ORDER)[number];
export type BmArea = NamedArea | "other";
export const ALL_AREAS: readonly BmArea[] = [...AREA_ORDER, "other"];

export const isArea = (v: unknown): v is BmArea => typeof v === "string" && (ALL_AREAS as readonly string[]).includes(v);

export const AREA_LABELS: Record<BmArea, string> = {
  conflict: "Conflict",
  failure: "Failure",
  ambiguity: "Ambiguity",
  leadership: "Leadership",
  ownership: "Ownership",
  teamwork: "Teamwork",
  why_company: "Why this company",
  other: "Other",
};

/** The most questions one mock may have. */
export const MAX_QUESTIONS = 10;
export const TARGET_MIN = 10;
export const TARGET_MAX = 900;
