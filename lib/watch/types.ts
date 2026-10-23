// Shapes shared by the Watch adapters (server) and the Watch screens (client).
// A snapshot is exactly what a source returned, trimmed to what the tab shows.

export type WatchKind = "espn_team" | "espn_news" | "headlines" | "jobs" | "weather" | "transit" | "newsletter";

// ---- Settings, one shape per adapter ----------------------------------------------------

export interface TeamConfig {
  sport: string;
  league: string;
  team: string;
  /** Players to show averages for, by name as on the roster ("Damian Lillard"). */
  players?: string[];
}
export interface NewsConfig { sport: string; league: string; limit: number }
export interface HeadlinesConfig { hn: boolean; feeds: string[]; limit: number }
export interface JobsConfig {
  categories: string[];
  locations: string[];
  exclude: string[];
  us_only?: boolean; // at least one location in the US
  bachelors?: boolean; // leave out roles that need a Master's or PhD (don't accept a Bachelor's, or say so in the title)
}
export interface NewsletterConfig {
  url: string; // the newsletter's "latest issue" page, e.g. https://www.morningbrew.com/issues/latest
  markets: boolean; // show the markets numbers card
}
export interface WeatherConfig { place: string; lat: number; lon: number; timezone: string }

export interface CommuteLeg { label: string; board_stop: string; destination: string }
export interface TransitConfig {
  route: string;
  timezone: string;
  switch_at: string; // "HH:MM" local; before it the first leg, from it the second
  before_switch: CommuteLeg;
  after_switch: CommuteLeg;
  departures_shown: number;
  show_alerts_for: string;
  manual_flip_toggle: boolean;
  cache_seconds: number;
}

// ---- Snapshots -------------------------------------------------------------------------

export interface Headline {
  title: string;
  url: string;
  source: string | null; // site or feed name
  at: string | null; // ISO time published
}
export interface NewsSnap { items: Headline[]; link: string }

export interface Game {
  id: string;
  date: string; // ISO start time
  opp: string; // abbreviation
  home: boolean;
  state: "pre" | "in" | "post";
  us: number | null;
  them: number | null;
  detail: string; // ESPN's short status, e.g. "Final/OT", "Q3 4:12"
  tv: string | null;
}
/** One line of ESPN's per-game averages: "GP", "MIN", "PTS", "REB", "AST", "FG%", "3P%", "FT%", … as given. */
export type StatLine = Record<string, string>;
export interface PlayerSnap {
  name: string;
  short: string; // "D. Lillard"
  season: StatLine | null; // null before their first game of the season
  career: StatLine | null;
}

export interface TeamSnap {
  name: string;
  record: string | null;
  home: string | null;
  road: string | null;
  standing: string | null; // "3rd in West"
  gamesBehind: string | null;
  streak: string | null;
  recent: Game[]; // most recent first
  upcoming: Game[]; // soonest first
  players?: PlayerSnap[];
  /** Followed names that weren't on the roster, so the tab can say so instead of hiding them. */
  missingPlayers?: string[];
  link: string;
}

/** A piece of a paragraph: the newsletter's own words, with its bold/italic/links. */
export interface Run { text: string; b?: true; i?: true; href?: string }
export type Block =
  | { t: "p"; runs: Run[] }
  | { t: "list"; ordered: boolean; items: Run[][] }
  | { t: "img"; src: string; alt: string; credit: string | null }
  | { t: "h"; text: string; href: string | null };
export interface NewsletterSection { kicker: string | null; blocks: Block[] }
export interface Market { name: string; value: string; change: string }
export interface NewsletterSnap {
  name: string; // "Morning Brew"
  subject: string | null;
  date: string | null; // as printed, "October 22, 2026"
  topics: string[]; // "In today's newsletter, we'll get into:"
  markets: Market[];
  sections: NewsletterSection[];
  dropped: number; // sponsored cards and ad blocks left out
  link: string; // the issue on the web
}

export interface WeatherHour { at: string; temp: number; code: number; precip: number | null }
export interface WeatherSnap {
  place: string;
  current: { temp: number; feels: number; code: number; at: string };
  today: { hi: number; lo: number; code: number; precip: number | null; sunrise: string; sunset: string };
  hours: WeatherHour[]; // local times ("2026-10-23T14:00"), from midnight today
  link: string;
}

export interface JobData {
  company: string;
  title: string;
  locations: string[];
  url: string;
  posted: string; // ISO
  category: string | null;
  sponsorship: string | null;
  degrees?: string[]; // degrees the posting accepts, as listed ("Bachelor's", "Master's", "PhD")
}
export interface JobsSnap { matched: number; active: number; link: string }

export interface Departure { at: string; mins: number; status: string | null; headsign: string | null }
export interface TransitAlert { header: string; effect: string; severity: number }
export interface TransitSnap {
  label: string;
  board: string;
  destination: string;
  flipped: boolean;
  departures: Departure[];
  alerts: TransitAlert[];
  fetchedAt: string;
  link: string;
}

/** The original page for each source: where the tab falls back to when it can't update. */
export function fallbackLink(kind: WatchKind, config: Record<string, unknown>): string {
  const c = config as Record<string, string>;
  switch (kind) {
    case "espn_team": return `https://www.espn.com/${c.league}/team/_/name/${c.team}`;
    case "espn_news": return `https://www.espn.com/${c.league}/`;
    case "headlines": return (config as unknown as HeadlinesConfig).hn ? "https://news.ycombinator.com/" : (config as unknown as HeadlinesConfig).feeds[0] ?? "https://news.ycombinator.com/";
    case "jobs": return "https://github.com/SimplifyJobs/New-Grad-Positions";
    case "weather": return `https://forecast.weather.gov/MapClick.php?lat=${c.lat}&lon=${c.lon}`;
    case "transit": return `https://www.mbta.com/schedules/${c.route}/line`;
    case "newsletter": return c.url || "https://www.morningbrew.com/issues/latest";
  }
}
