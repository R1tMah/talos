"use client";

// The settings form for a Watch source: the same few fields the adapter reads, laid
// out per kind. Lists are typed comma-separated (feeds one per line).

import { FormSheet, type Field } from "@/components/FormSheet";
import { CalendarForm } from "./Calendar";
import { TeamForm } from "./TeamForm";
import type { SourceInput, WatchSource } from "@/lib/watch/data";
import type { CalendarConfig, HeadlinesConfig, JobsConfig, NewsConfig, NewsletterConfig, TeamConfig, TransitConfig, WatchKind, WeatherConfig } from "@/lib/watch/types";

export const LEAGUES: Record<string, string> = {
  nba: "basketball", wnba: "basketball", nfl: "football", "college-football": "football", mlb: "baseball", nhl: "hockey",
  "eng.1": "soccer", "usa.1": "soccer",
};

export const KIND_LABELS: Partial<Record<WatchKind, string>> = {
  espn_team: "Team", espn_news: "Sports headlines", headlines: "Tech headlines", jobs: "Job postings", weather: "Weather", transit: "Train departures",
  newsletter: "Newsletter", calendar: "Google Calendar",
};

/** Starting settings for a source added from the form. */
export const DEFAULTS: Partial<Record<WatchKind, { title: string; every: number; config: object }>> = {
  espn_team: { title: "Team", every: 30, config: { sport: "basketball", league: "nba", team: "" } satisfies TeamConfig },
  espn_news: { title: "Sports", every: 60, config: { sport: "football", league: "nfl", limit: 15 } satisfies NewsConfig },
  headlines: { title: "Headlines", every: 60, config: { hn: false, feeds: [], limit: 15 } satisfies HeadlinesConfig },
  jobs: { title: "Jobs", every: 240, config: { categories: ["Software"], locations: [], exclude: [] } satisfies JobsConfig },
  calendar: { title: "Calendar", every: 15, config: { calendars: [], timezone: "America/New_York", days: 7 } satisfies CalendarConfig },
  newsletter: { title: "Morning Brew", every: 60, config: { url: "https://www.morningbrew.com/issues/latest", markets: true } satisfies NewsletterConfig },
  weather: { title: "Weather", every: 30, config: { place: "Boston", lat: 42.3601, lon: -71.0589, timezone: "America/New_York" } satisfies WeatherConfig },
  transit: {
    title: "Train", every: 15,
    config: {
      route: "Green-B", timezone: "America/New_York", switch_at: "12:00",
      before_switch: { label: "", board_stop: "", destination: "" }, after_switch: { label: "", board_stop: "", destination: "" },
      departures_shown: 3, show_alerts_for: "Green-B", manual_flip_toggle: true, cache_seconds: 20,
    } satisfies TransitConfig,
  },
};

type Values = Record<string, unknown>;
const list = (v: unknown) => String(v ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const str = (v: unknown) => String(v ?? "").trim();

function fieldsFor(kind: WatchKind): Field[] {
  const common: Field[] = [{ name: "title", label: "Name" }];
  const every: Field = { name: "every", label: "Refresh every (min)", type: "number" };
  const show: Field = { name: "enabled", label: "Show on Watch", type: "toggle" };
  switch (kind) {
    case "espn_news":
      return [...common, { name: "league", label: "League", type: "select", options: Object.keys(LEAGUES) },
        { name: "limit", label: "Headlines", type: "number" }, every, show];
    case "headlines":
      return [...common, { name: "hn", label: "Hacker News front page", type: "toggle" },
        { name: "feeds", label: "RSS feeds, one per line", type: "textarea", placeholder: "https://www.theverge.com/rss/index.xml" },
        { name: "limit", label: "Per source", type: "number" }, every, show];
    case "jobs":
      return [...common,
        { name: "categories", label: "Roles", full: true, placeholder: "Software, AI/ML/Data, Quant, Product, Hardware" },
        { name: "locations", label: "Locations (blank = anywhere)", full: true, placeholder: "Boston, NYC, Remote" },
        { name: "us_only", label: "US only", type: "toggle" },
        { name: "bachelors", label: "Leave out Master's/PhD roles", type: "toggle" },
        { name: "exclude", label: "Leave out titles with", full: true, placeholder: "Senior, Clearance" }, every, show];
    case "newsletter":
      return [...common, { name: "url", label: "Latest-issue page", full: true, placeholder: "https://www.morningbrew.com/issues/latest" },
        { name: "markets", label: "Markets numbers", type: "toggle" }, every, show];
    case "weather":
      return [...common, { name: "place", label: "Place" }, { name: "lat", label: "Latitude", type: "number", optional: true },
        { name: "lon", label: "Longitude", type: "number", optional: true }, every, show];
    case "transit":
      return [...common,
        { name: "route", label: "Route (MBTA id)" }, { name: "switch_at", label: "Switch direction at", type: "time" },
        { name: "b_label", label: "Morning label", full: true }, { name: "b_board", label: "Board at" }, { name: "b_dest", label: "Toward" },
        { name: "a_label", label: "Afternoon label", full: true }, { name: "a_board", label: "Board at" }, { name: "a_dest", label: "Toward" },
        { name: "shown", label: "Departures shown", type: "number" }, { name: "flip", label: "Flip button", type: "toggle" }, show];
    default:
      return [...common, show];
  }
}

function toValues(s: Pick<WatchSource, "kind" | "title" | "config" | "enabled" | "everyMinutes">): Values {
  const c = s.config as Record<string, unknown>;
  const base = { title: s.title, enabled: s.enabled, every: s.everyMinutes };
  switch (s.kind) {
    case "espn_news": return { ...base, league: c.league, limit: c.limit };
    case "headlines": return { ...base, hn: c.hn, feeds: (c.feeds as string[]).join("\n"), limit: c.limit };
    case "jobs": {
      const j = c as unknown as JobsConfig;
      return { ...base, categories: j.categories.join(", "), locations: j.locations.join(", "), exclude: j.exclude.join(", "), us_only: j.us_only, bachelors: j.bachelors };
    }
    case "weather": return { ...base, place: c.place, lat: c.lat, lon: c.lon };
    case "newsletter": return { ...base, url: c.url, markets: c.markets };
    case "transit": {
      const t = c as unknown as TransitConfig;
      return {
        ...base, route: t.route, switch_at: t.switch_at, shown: t.departures_shown, flip: t.manual_flip_toggle,
        b_label: t.before_switch.label, b_board: t.before_switch.board_stop, b_dest: t.before_switch.destination,
        a_label: t.after_switch.label, a_board: t.after_switch.board_stop, a_dest: t.after_switch.destination,
      };
    }
    default: return base;
  }
}

/** Form values back to settings; keeps any setting the form doesn't show. */
function fromValues(kind: WatchKind, prev: Record<string, unknown>, v: Values): SourceInput {
  const base = { title: str(v.title), enabled: Boolean(v.enabled), everyMinutes: Number(v.every) || 30 };
  switch (kind) {
    case "espn_news": return { ...base, config: { ...prev, league: v.league, sport: LEAGUES[v.league as string], limit: Number(v.limit) } };
    case "headlines": return { ...base, config: { ...prev, hn: Boolean(v.hn), feeds: list(v.feeds), limit: Number(v.limit) } };
    case "jobs": return { ...base, config: { ...prev, categories: list(v.categories), locations: list(v.locations), exclude: list(v.exclude),
      us_only: Boolean(v.us_only), bachelors: Boolean(v.bachelors) } };
    case "weather": return { ...base, config: { ...prev, place: str(v.place), lat: Number(v.lat), lon: Number(v.lon) } };
    case "newsletter": return { ...base, config: { ...prev, url: str(v.url), markets: Boolean(v.markets) } };
    case "transit": return {
      ...base, everyMinutes: 15,
      config: {
        ...prev, route: str(v.route), show_alerts_for: str(v.route), switch_at: str(v.switch_at), departures_shown: Number(v.shown), manual_flip_toggle: Boolean(v.flip),
        before_switch: { label: str(v.b_label), board_stop: str(v.b_board), destination: str(v.b_dest) },
        after_switch: { label: str(v.a_label), board_stop: str(v.a_board), destination: str(v.a_dest) },
      },
    };
    default: return { ...base, config: prev };
  }
}

function validate(kind: WatchKind, v: Values): string | null {
  if (!str(v.title)) return "Name is required.";
  const every = Number(v.every);
  if (kind !== "transit" && (!Number.isInteger(every) || every < 15 || every > 1440)) return "Refresh every 15 to 1440 minutes.";
  if ((kind === "espn_news" || kind === "headlines") && !(Number(v.limit) >= 1 && Number(v.limit) <= 50)) return "Show 1 to 50 headlines.";
  if (kind === "headlines") {
    if (!v.hn && !list(v.feeds).length) return "Turn on Hacker News or add a feed.";
    if (list(v.feeds).some((f) => !/^https?:\/\/\S+$/.test(f))) return "Each feed must be a full http(s) link.";
  }
  if (kind === "newsletter" && !/^https:\/\/\S+$/.test(str(v.url))) return "The latest-issue page must be a full https link.";
  if (kind === "weather" && !(Math.abs(Number(v.lat)) <= 90 && Math.abs(Number(v.lon)) <= 180 && str(v.lat) && str(v.lon))) return "Latitude and longitude are required.";
  if (kind === "transit") {
    if (!str(v.route)) return "Route is required.";
    if (![v.b_board, v.b_dest, v.a_board, v.a_dest].every((x) => str(x))) return "Each direction needs a stop and a destination.";
    if (!(Number(v.shown) >= 1 && Number(v.shown) <= 6)) return "Show 1 to 6 departures.";
  }
  return null;
}

export function SourceForm({
  source, onSubmit, onClose,
}: {
  source: Pick<WatchSource, "kind" | "title" | "config" | "enabled" | "everyMinutes"> & { id?: string };
  onSubmit: (v: SourceInput) => void;
  onClose: () => void;
}) {
  // The calendar picks from the Google account's own calendar list.
  if (source.kind === "calendar") return <CalendarForm source={source} onSubmit={onSubmit} onClose={onClose} />;
  // A team picks its players from the live roster.
  if (source.kind === "espn_team") return <TeamForm source={source} onSubmit={onSubmit} onClose={onClose} />;
  return (
    <FormSheet
      title={source.id ? `${source.title} settings` : `Add ${KIND_LABELS[source.kind]?.toLowerCase() ?? "source"}`}
      fields={fieldsFor(source.kind)}
      initial={toValues(source)}
      validate={(v) => validate(source.kind, v)}
      onClose={onClose}
      onSubmit={(v) => onSubmit(fromValues(source.kind, source.config, v))}
    />
  );
}
