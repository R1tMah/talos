// The jobs filter, shared by the refresh job (what gets stored) and the Jobs tab
// (re-applied on display, so a settings change shows immediately).

import type { JobData, JobsConfig } from "./types";

const lower = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Does a listing pass the owner's filters? Empty lists mean "any". */
export function jobMatches(j: Pick<JobData, "title" | "locations" | "category">, c: JobsConfig): boolean {
  const cats = lower(c.categories), locs = lower(c.locations), excl = lower(c.exclude);
  if (cats.length && !cats.includes((j.category ?? "").toLowerCase())) return false;
  if (locs.length && !j.locations.some((l) => locs.some((f) => l.toLowerCase().includes(f)))) return false;
  const title = j.title.toLowerCase();
  return !excl.some((w) => title.includes(w));
}
