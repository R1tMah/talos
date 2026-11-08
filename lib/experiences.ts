// Recommendations & Experiences: things people recommend (pending) and the archive of ones
// done (completed). Pure: the Supabase side is lib/experiencesData.ts.

/** The fixed categories, in display order (the database accepts exactly these). */
export const EXPERIENCE_CATEGORIES = [
  "Books", "Podcasts", "Movies & TV", "Music", "Restaurants & Dining", "Travel Experiences",
  "Physical Hobbies", "Wellness Routines", "Career Strategies", "Financial Vehicles",
] as const;
export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];
export const isExperienceCategory = (v: unknown): v is ExperienceCategory => EXPERIENCE_CATEGORIES.includes(v as ExperienceCategory);

export interface Experience {
  id: string;
  title: string;
  category: ExperienceCategory;
  recommendedBy: string | null;
  status: "pending" | "completed";
  createdAt: string;
  completedAt: string | null;
  note: string | null;
  rating: number | null;
}

/** Items grouped by category, in category order, skipping empty ones. */
export function byCategory(items: readonly Experience[]): { category: ExperienceCategory; items: Experience[] }[] {
  return EXPERIENCE_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter((g) => g.items.length);
}
