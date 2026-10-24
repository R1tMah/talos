// Watch adapters: one small fetcher per kind of source. Server-side only.
//
// Each takes the owner's settings for the source and returns a snapshot of what the
// source said, trimmed to what the tab shows. No rewriting, ranking or summarizing:
// titles, scores and times are copied as the source gave them. Anything unexpected
// throws, so the refresh job records the error and the tab falls back to a link.

import type {
  Departure, Game, Headline, HeadlinesConfig, JobData, JobsConfig, NewsConfig, NewsSnap, TeamConfig, TeamSnap,
  NewsletterConfig, NewsletterSnap, PlayerSnap, StatLine, TransitAlert, TransitConfig, TransitSnap, WeatherConfig, WeatherSnap,
} from "./types";
import { fallbackLink } from "./types";
import { jobMatches } from "./match";
import { parseNewsletter } from "./newsletter";
import { categoryOf, isOpen, onNewGradList } from "./simplify";

const TIMEOUT_MS = 15_000;

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res;
}
const getJson = async <T>(url: string, init?: RequestInit) => (await get(url, init)).json() as Promise<T>;

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// ---- ESPN (unofficial site API) ------------------------------------------------------------

const ESPN = "https://site.api.espn.com/apis";

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { abbreviation: string };
  score?: { displayValue?: string } | string;
  winner?: boolean;
}
interface EspnEvent {
  id: string;
  date: string;
  competitions: {
    competitors: EspnCompetitor[];
    status: { type: { state: "pre" | "in" | "post"; shortDetail: string } };
    broadcasts?: { media?: { shortName?: string } }[];
  }[];
}

const scoreOf = (c: EspnCompetitor) => {
  const s = typeof c.score === "string" ? c.score : c.score?.displayValue;
  return s == null || s === "" ? null : Number(s);
};
const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

export async function fetchTeam(c: TeamConfig): Promise<TeamSnap> {
  const base = `${ESPN}/site/v2/sports/${c.sport}/${c.league}`;
  const [team, schedule, standings] = await Promise.all([
    getJson<{ team: { displayName: string; abbreviation: string; record?: { items?: { type: string; summary: string }[] } } }>(`${base}/teams/${c.team}`),
    getJson<{ events: EspnEvent[] }>(`${base}/teams/${c.team}/schedule`),
    // Standings are a nice-to-have: the tab still works without them.
    getJson<{ children?: { name: string; abbreviation?: string; standings: { entries: { team: { abbreviation: string }; stats: { name: string; displayValue?: string; value?: number }[] }[] } }[] }>(
      `${ESPN}/v2/sports/${c.sport}/${c.league}/standings`,
    ).catch(() => null),
  ]);
  const t = team.team;
  const rec = (type: string) => t.record?.items?.find((r) => r.type === type)?.summary ?? null;

  const games: Game[] = schedule.events.map((e) => {
    const comp = e.competitions[0];
    const us = comp.competitors.find((x) => x.team.abbreviation.toLowerCase() === t.abbreviation.toLowerCase())!;
    const them = comp.competitors.find((x) => x !== us)!;
    return {
      id: e.id,
      date: e.date,
      opp: them.team.abbreviation,
      home: us.homeAway === "home",
      state: comp.status.type.state,
      us: scoreOf(us),
      them: scoreOf(them),
      detail: comp.status.type.shortDetail,
      tv: comp.broadcasts?.[0]?.media?.shortName ?? null,
    };
  });

  let standing: string | null = null, gamesBehind: string | null = null, streak: string | null = null;
  for (const group of standings?.children ?? []) {
    const entry = group.standings.entries.find((x) => x.team.abbreviation.toLowerCase() === t.abbreviation.toLowerCase());
    if (!entry) continue;
    const stat = (name: string) => entry.stats.find((s) => s.name === name);
    const seed = stat("playoffSeed")?.value;
    standing = seed ? `${ordinal(seed)} in ${group.abbreviation ?? group.name}` : null;
    gamesBehind = stat("gamesBehind")?.displayValue ?? null;
    streak = stat("streak")?.displayValue ?? null;
  }

  const { players, missing } = await fetchPlayers(c);

  return {
    name: t.displayName,
    record: rec("total"),
    home: rec("home"),
    road: rec("road"),
    standing,
    gamesBehind,
    streak,
    recent: games.filter((g) => g.state === "post").reverse().slice(0, 5),
    upcoming: games.filter((g) => g.state !== "post").slice(0, 5),
    players,
    missingPlayers: missing,
    link: fallbackLink("espn_team", { ...c }),
  };
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

interface EspnRoster {
  season?: { year: number };
  athletes: { id: string; displayName: string; shortName: string }[];
}

/** The team's current roster, as ESPN lists it (also what the settings form picks from). */
export const fetchRoster = (c: Pick<TeamConfig, "sport" | "league" | "team">) =>
  getJson<EspnRoster>(`${ESPN}/site/v2/sports/${c.sport}/${c.league}/teams/${c.team}/roster`);

interface EspnAthleteStats {
  categories?: { name: string; labels: string[]; statistics?: { season: { year: number }; stats: string[] }[] }[];
}

/**
 * One season's line: per-game PTS/REB/AST/TO and ESPN's FG%, 3P%, FT% and AST/TO, plus
 * eFG% and TS% worked out from the season totals. Null if they haven't played that season.
 */
export function seasonLine(s: EspnAthleteStats, year: number): StatLine | null {
  const row = (cat: string): StatLine | null => {
    const c = s.categories?.find((x) => x.name === cat);
    const r = c?.statistics?.find((x) => x.season.year === year);
    return c && r ? Object.fromEntries(c.labels.map((l, i) => [l, r.stats[i]])) : null;
  };
  const avg = row("averages");
  if (!avg) return null;
  const tot = row("totals");
  const misc = row("miscellaneous");
  const madeOf = (v?: string) => (v ?? "").split("-").map(Number); // "7-16" -> [7, 16]
  const [fgm, fga] = madeOf(tot?.FG);
  const [tpm] = madeOf(tot?.["3PT"]);
  const [, fta] = madeOf(tot?.FT);
  const pct = (n: number, d: number) => (d > 0 && Number.isFinite(n) ? ((100 * n) / d).toFixed(1) : "–");
  return {
    GP: avg.GP, PTS: avg.PTS, REB: avg.REB, AST: avg.AST, TO: avg.TO,
    "FG%": avg["FG%"], "3P%": avg["3P%"], "FT%": avg["FT%"],
    "eFG%": pct(fgm + 0.5 * tpm, fga),
    "TS%": pct(Number(tot?.PTS), 2 * (fga + 0.44 * fta)),
    "AST/TO": misc?.["AST/TO"] ?? "–",
  };
}

/** This season's line for each followed player, found by name on the team's roster. */
async function fetchPlayers(c: TeamConfig): Promise<{ players: PlayerSnap[]; missing: string[] }> {
  const wanted = (c.players ?? []).filter((n) => n.trim());
  if (!wanted.length) return { players: [], missing: [] };
  // Like standings, player stats are extra: a failure here leaves the rest of the team card intact.
  const roster = await fetchRoster(c).catch(() => null);
  if (!roster?.season) return { players: [], missing: [] };
  const year = roster.season.year;
  const found = wanted.map((n) => ({ n, a: roster.athletes.find((a) => nameKey(a.displayName) === nameKey(n)) }));
  const players = await Promise.all(
    found.filter((f) => f.a).map(async ({ a }) => {
      const st = await getJson<EspnAthleteStats>(
        `https://site.web.api.espn.com/apis/common/v3/sports/${c.sport}/${c.league}/athletes/${a!.id}/stats`,
      ).catch(() => null);
      return { name: a!.displayName, short: a!.shortName, season: st ? seasonLine(st, year) : null };
    }),
  );
  return { players, missing: found.filter((f) => !f.a).map((f) => f.n) };
}

export async function fetchNews(c: NewsConfig): Promise<NewsSnap> {
  const res = await getJson<{ articles: { headline: string; published?: string; links?: { web?: { href?: string } } }[] }>(
    `${ESPN}/site/v2/sports/${c.sport}/${c.league}/news?limit=${c.limit}`,
  );
  const items: Headline[] = res.articles
    .filter((a) => a.headline && a.links?.web?.href)
    .map((a) => ({ title: a.headline, url: a.links!.web!.href!, source: "ESPN", at: a.published ?? null }));
  return { items: items.slice(0, c.limit), link: fallbackLink("espn_news", { ...c }) };
}

// ---- Headlines: Hacker News front page and RSS/Atom feeds -----------------------------------

async function hackerNews(limit: number): Promise<Headline[]> {
  const res = await getJson<{ hits: { objectID: string; title: string; url?: string | null; created_at: string }[] }>(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`,
  );
  return res.hits.map((h) => ({
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: h.url ? host(h.url) : "news.ycombinator.com",
    at: h.created_at,
  }));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];

/** Titles and links from an RSS 2.0 or Atom feed. Only the title is kept; never the body. */
export function parseFeed(xml: string, feedUrl: string): Headline[] {
  const feedTitle = decode(tag(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ""), "title") ?? "") || host(feedUrl);
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks.flatMap((b) => {
    const title = decode(tag(b, "title") ?? "");
    const link =
      decode(tag(b, "link") ?? "") ||
      b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
      b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ||
      "";
    const date = decode(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "");
    const at = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    return title && /^https?:\/\//.test(link) ? [{ title, url: link, source: feedTitle, at }] : [];
  });
}

export async function fetchHeadlines(c: HeadlinesConfig): Promise<NewsSnap> {
  const parts = await Promise.allSettled([
    c.hn ? hackerNews(c.limit) : Promise.resolve([]),
    ...c.feeds.map(async (url) => parseFeed(await (await get(url, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } })).text(), url).slice(0, c.limit)),
  ]);
  const ok = parts.flatMap((p) => (p.status === "fulfilled" ? [p.value] : []));
  if (!ok.length || ok.every((x) => !x.length)) {
    const failed = parts.find((p) => p.status === "rejected");
    throw failed ? (failed as PromiseRejectedResult).reason : new Error("no headlines");
  }
  // Hacker News keeps its own front-page order; feeds are newest first.
  const [hn, ...feeds] = ok;
  const rest = feeds.flat().sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return { items: [...(c.hn ? hn : []), ...rest].slice(0, c.limit * Math.max(1, ok.length)), link: fallbackLink("headlines", { ...c }) };
}

// ---- Newsletters: the public "latest issue" page (same HTML as the email) ----------------

export async function fetchNewsletter(c: NewsletterConfig, name: string): Promise<NewsletterSnap> {
  const html = await (await get(c.url, { headers: { "User-Agent": "Mozilla/5.0 (TALOS personal reader)", Accept: "text/html" } })).text();
  const snap = parseNewsletter(html, { name, url: c.url, markets: c.markets });
  if (!snap.sections.length) throw new Error("the issue had no readable sections");
  return snap;
}

// ---- Weather: Open-Meteo (free, no key) ----------------------------------------------------

export async function fetchWeather(c: WeatherConfig): Promise<WeatherSnap> {
  const q = new URLSearchParams({
    latitude: String(c.lat),
    longitude: String(c.lon),
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset",
    temperature_unit: "fahrenheit",
    timezone: c.timezone,
    forecast_days: "2",
  });
  const r = await getJson<{
    current: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number };
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; weather_code: number[] };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: (number | null)[]; sunrise: string[]; sunset: string[] };
  }>(`https://api.open-meteo.com/v1/forecast?${q}`);
  return {
    place: c.place,
    current: { temp: r.current.temperature_2m, feels: r.current.apparent_temperature, code: r.current.weather_code, at: r.current.time },
    today: {
      hi: r.daily.temperature_2m_max[0], lo: r.daily.temperature_2m_min[0], code: r.daily.weather_code[0],
      precip: r.daily.precipitation_probability_max[0], sunrise: r.daily.sunrise[0], sunset: r.daily.sunset[0],
    },
    hours: r.hourly.time.map((at, i) => ({ at, temp: r.hourly.temperature_2m[i], code: r.hourly.weather_code[i], precip: r.hourly.precipitation_probability[i] })),
    link: fallbackLink("weather", { ...c }),
  };
}

// ---- Jobs: SimplifyJobs new-grad list ------------------------------------------------------

const LISTINGS = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";

interface Listing {
  id: string;
  company_name: string;
  title: string;
  locations: string[];
  url: string;
  date_posted: number; // unix seconds
  category?: string;
  sponsorship?: string;
  source?: string;
  company_url?: string;
  degrees?: string[];
  active: boolean;
  is_visible: boolean;
}

export interface JobsFetch {
  /** Every listing that's open and visible, by id (so closed ones can be told apart from filtered ones). */
  open: Map<string, JobData>;
  /** Of those, the ids that are on the README's new-grad list and match the owner's filters. */
  matched: Set<string>;
}

export async function fetchJobs(c: JobsConfig): Promise<JobsFetch> {
  const all = await getJson<Listing[]>(LISTINGS);
  if (!Array.isArray(all) || !all.length) throw new Error("job list was empty");
  const open = new Map<string, JobData>();
  const matched = new Set<string>();
  for (const l of all) {
    if (!isOpen(l) || !l.is_visible || !l.id) continue;
    const job: JobData = {
      company: l.company_name, title: l.title, locations: l.locations ?? [], url: l.url,
      posted: new Date(l.date_posted * 1000).toISOString(), category: categoryOf(l), sponsorship: l.sponsorship ?? null,
      degrees: l.degrees ?? [],
    };
    open.set(l.id, job);
    // listings.json also holds scraped postings the README leaves out; only the list counts.
    if (onNewGradList(l) && jobMatches(job, c)) matched.add(l.id);
  }
  return { open, matched };
}

// ---- Transit: MBTA v3 API (live, cached briefly) -------------------------------------------

const MBTA = "https://api-v3.mbta.com";
const mbtaInit = (): RequestInit => (process.env.MBTA_API_KEY ? { headers: { "x-api-key": process.env.MBTA_API_KEY } } : {});
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Stops in order for direction 0, per route. Stops rarely change; kept for a day.
const stopCache = new Map<string, { at: number; stops: { id: string; name: string }[] }>();
async function routeStops(route: string) {
  const hit = stopCache.get(route);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.stops;
  const r = await getJson<{ data: { id: string; attributes: { name: string } }[] }>(
    `${MBTA}/stops?filter[route]=${encodeURIComponent(route)}&filter[direction_id]=0`, mbtaInit(),
  );
  const stops = r.data.map((s) => ({ id: s.id, name: s.attributes.name }));
  stopCache.set(route, { at: Date.now(), stops });
  return stops;
}

/** "HH:MM" now in a timezone. */
const clockIn = (tz: string, now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);

/** Which leg of the commute applies now: before switch_at the first, after it the second; flip swaps them. */
export function commuteLeg(c: TransitConfig, now: Date, flip: boolean) {
  const after = clockIn(c.timezone, now) >= c.switch_at;
  return (after !== flip) ? c.after_switch : c.before_switch;
}

// Effects that are about the building, not the trains.
const QUIET = new Set(["ELEVATOR_CLOSURE", "ESCALATOR_CLOSURE", "ACCESS_ISSUE", "PARKING_CLOSURE", "PARKING_ISSUE", "BIKE_ISSUE", "AMBER_ALERT", "FACILITY_ISSUE"]);

const transitCache = new Map<string, { at: number; snap: TransitSnap }>();

export async function fetchTransit(c: TransitConfig, flip: boolean, now = new Date()): Promise<TransitSnap> {
  const leg = commuteLeg(c, now, flip);
  const key = JSON.stringify([c.route, leg, c.departures_shown, c.show_alerts_for]);
  const hit = transitCache.get(key);
  if (hit && now.getTime() - hit.at < c.cache_seconds * 1000) return { ...hit.snap, flipped: flip };

  const stops = await routeStops(c.route);
  const find = (name: string) => {
    const i = stops.findIndex((s) => norm(s.name) === norm(name));
    if (i < 0) throw new Error(`no stop named "${name}" on ${c.route}`);
    return i;
  };
  const from = find(leg.board_stop), to = find(leg.destination);
  if (from === to) throw new Error("board stop and destination are the same");
  const direction = from < to ? 0 : 1;

  const [pred, alerts] = await Promise.all([
    getJson<{
      data: { attributes: { departure_time: string | null; status: string | null }; relationships: { trip: { data: { id: string } } } }[];
      included?: { id: string; type: string; attributes: { headsign?: string } }[];
    }>(
      `${MBTA}/predictions?filter[stop]=${stops[from].id}&filter[route]=${encodeURIComponent(c.route)}&filter[direction_id]=${direction}&sort=departure_time&include=trip`,
      mbtaInit(),
    ),
    getJson<{ data: { attributes: { header: string; effect: string; severity: number } }[] }>(
      `${MBTA}/alerts?filter[route]=${encodeURIComponent(c.show_alerts_for)}&filter[datetime]=NOW`, mbtaInit(),
    ).catch(() => ({ data: [] })),
  ]);

  const headsign = new Map((pred.included ?? []).filter((x) => x.type === "trip").map((x) => [x.id, x.attributes.headsign ?? null]));
  const departures: Departure[] = pred.data
    .filter((p) => p.attributes.departure_time && Date.parse(p.attributes.departure_time) >= now.getTime() - 30_000)
    .slice(0, c.departures_shown)
    .map((p) => ({
      at: p.attributes.departure_time!,
      mins: Math.max(0, Math.round((Date.parse(p.attributes.departure_time!) - now.getTime()) / 60_000)),
      status: p.attributes.status,
      headsign: headsign.get(p.relationships.trip.data.id) ?? null,
    }));
  const alertList: TransitAlert[] = alerts.data
    .filter((a) => !QUIET.has(a.attributes.effect))
    .sort((a, b) => b.attributes.severity - a.attributes.severity)
    .slice(0, 3)
    .map((a) => ({ header: a.attributes.header, effect: a.attributes.effect, severity: a.attributes.severity }));

  const snap: TransitSnap = {
    label: leg.label, board: stops[from].name, destination: stops[to].name, flipped: flip,
    departures, alerts: alertList, fetchedAt: now.toISOString(), link: fallbackLink("transit", { ...c }),
  };
  transitCache.set(key, { at: now.getTime(), snap });
  return snap;
}
