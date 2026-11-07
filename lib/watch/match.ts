// The jobs filter, shared by the refresh job (what gets stored) and the Jobs tab
// (re-applied on display, so a settings change shows immediately).

import { categoryName } from "./simplify";
import type { JobData, JobsConfig } from "./types";

const STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR").split(" "));
const STATE_NAMES = /^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)$/i;
// The list's own shorthands for US places.
const US_NAMES = /^(sf|nyc|la|united states|usa|us|remote in usa|remote in us|remote(,? us(a)?)?)$/i;

/** "San Jose, CA", "NYC", "Remote in USA", "Texas": yes. "London, UK", "Toronto, ON, Canada": no. */
export function isUSLocation(loc: string): boolean {
  const l = loc.trim();
  const st = l.match(/,\s*([A-Z]{2})$/);
  if (st) return STATES.has(st[1]);
  return US_NAMES.test(l) || STATE_NAMES.test(l) || /\b(usa|united states)\b/i.test(l);
}

/** Needs a Master's or PhD: doesn't accept a Bachelor's, or names one in the title. */
export function needsGradDegree(j: Pick<JobData, "title" | "degrees">): boolean {
  if (/\bph\.?\s?d\b|\bmaster'?s?\b|\bm\.s\.\b/i.test(j.title)) return true;
  const d = (j.degrees ?? []).map((x) => x.toLowerCase());
  return d.length > 0 && !d.some((x) => x.startsWith("bachelor")) && d.some((x) => x.startsWith("master") || x.startsWith("phd"));
}

/** Only postings from the last week are shown. */
export const POSTED_WITHIN_DAYS = 7;

/** Was the posting put up within the last POSTED_WITHIN_DAYS days? */
export function postedRecently(j: Pick<JobData, "posted">, now = Date.now()): boolean {
  const at = Date.parse(j.posted);
  return !Number.isNaN(at) && now - at <= POSTED_WITHIN_DAYS * 86_400_000;
}

const lower = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Does a listing pass the owner's filters? Empty lists mean "any". */
export function jobMatches(j: Pick<JobData, "title" | "locations" | "category" | "degrees">, c: JobsConfig): boolean {
  if (c.us_only && !j.locations.some(isUSLocation)) return false;
  if (c.bachelors && needsGradDegree(j)) return false;
  const cats = lower(c.categories), locs = lower(c.locations), excl = lower(c.exclude);
  // Roles are the README's sections; "Software" and "Software Engineering" mean the same one.
  if (cats.length && !cats.some((x) => (categoryName(x) ?? x).toLowerCase() === (categoryName(j.category ?? "") ?? j.category ?? "").toLowerCase())) return false;
  if (locs.length && !j.locations.some((l) => locs.some((f) => l.toLowerCase().includes(f)))) return false;
  const title = j.title.toLowerCase();
  return !excl.some((w) => title.includes(w));
}
