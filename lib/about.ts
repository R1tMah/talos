// Settings > About: what Talos is and everything in it, as one plain-text block the owner
// can read or copy. Pure; the page (app/settings/about) supplies the live parts: which
// tabs are archived and which Watch tabs exist.
//
// Keeping it current: every tab has one entry in ABOUT_TABS, and every Watch kind one
// line in WATCH_KINDS. tests/unit/about.test.ts fails when a tab in lib/tabs.ts or
// lib/tabGroups.ts has no entry here, and TypeScript fails when a WatchKind has no line,
// so adding a tab means writing its description here too.

import type { WatchKind } from "./watch/types";

export const ABOUT_GENERAL = [
  "Talos is a personal tracking app for one person, its owner. It's a mobile-first web app (Next.js, installable to the home screen) backed by Supabase, and only the owner can sign in.",
  "The main way in is Chat: type a short message like \"168.4\", \"chipotle bowl\", \"ran 3 mi in 27:30\" or \"applied to Stripe\", and a Claude model picks the tab and fills in the fields. Code then checks every field against what was actually typed, so nothing is estimated or made up. Anything unclear comes back as a card to confirm, pick from, or fill in, and every save has an Undo.",
  "Each tab can also be used by hand: add, edit and delete rows, with stats and charts built from the owner's own entries. Watch pulls in outside information (scores, headlines, jobs, weather, trains, newsletters, calendar) on a schedule, read-only. Finances covers the bank account through Plaid, plus spending and subscriptions.",
  "Around the tabs: tabs can be archived to hide them without losing data; a weekly email digest goes out on the owner's chosen day; Settings can export a markdown review packet and a full JSON backup. Throughout, Talos only shows numbers and the owner's own words. It never generates, judges or rewrites them.",
].join("\n\n");

export interface AboutTab {
  /** A key from lib/tabs.ts (archivable, chat or once-in-a-while) or a fixed tab's own name. */
  key: string;
  label: string;
  /** Where it lives in the app. */
  where: string;
  about: string;
  /** Hidden behind a feature flag that's off: listed, but marked as off. */
  off?: boolean;
}

/** Every tab, in the order the app shows them. */
export const ABOUT_TABS: AboutTab[] = [
  { key: "chat", label: "Chat", where: "Bottom bar", about: "Logs to any tab from one short message. A chip narrows a message to one tab; chat history and API usage are in Settings." },
  { key: "weight", label: "Weight", where: "Tabs", about: "Daily weigh-ins with notes, weekly averages, a chart, and breaks (trips, weeks away) marked on it. Always on." },
  { key: "nutrition", label: "Nutrition", where: "Tabs", about: "Calories and protein per day against targets set in Settings. Log one-off foods, saved meals (with ingredients, and an optional price that also logs spending), or foods from the library." },
  { key: "workout", label: "Workout & Lifts", where: "Tabs", about: "Live workout logging with a rest timer, and lift progression charts (estimated one-rep max).", off: true },
  { key: "leetcode", label: "LeetCode", where: "Tabs > Interviews", about: "Problems worked on, with result, hints used, minutes, notes, difficulty and topic, weekly counts, and a redo queue for ones to try again." },
  { key: "sysdesign", label: "System Design Mocks", where: "Tabs > Interviews", about: "Summaries of mock system design rounds, pasted in after each one." },
  { key: "aiassisted", label: "AI-Assisted Mocks", where: "Tabs > Interviews", about: "Summaries of mock AI-assisted coding rounds (coding with an AI assistant allowed)." },
  { key: "behavioral", label: "Behavioral Mocks", where: "Tabs > Interviews", about: "Full mock behavioral rounds. Give the company, role and the job description (PDF or pasted); an Architect model writes one tailored question for each of six areas (conflict, failure, ambiguity, leadership, ownership, teamwork), plus \"Why this company?\" if you want it, each with a rubric and a target length. Answer each out loud with the mic while a clock counts up; a Grader model grades the content, and the app takes off a Yap Penalty (1 point per full 15 seconds over the target, at most 3). The summary has the overall score; copy the full scorecard as Markdown, or any question's second-opinion prompt for another model. Which model plays each role is set in Settings." },
  { key: "runs", label: "Runs", where: "Tabs", about: "Distance, time and pace for each run, with weekly mileage." },
  { key: "applications", label: "Applications", where: "Tabs > Recruiting", about: "Job applications sent and their status, plus a list of postings to apply to, with reminders." },
  { key: "callbacks", label: "Callbacks", where: "Tabs > Recruiting", about: "Recruiter calls, online assessments and interviews, with scores and outcomes." },
  { key: "personal", label: "Personal Journal", where: "Tabs > Journals", about: "Personal journal entries in the owner's own words." },
  { key: "journal", label: "Work Journal", where: "Tabs > Journals", about: "Notes on work: what was done, learned, and decided." },
  { key: "content", label: "Content", where: "Tabs > Journals", about: "Ideas for content to make." },
  { key: "learning", label: "Learning", where: "Tabs", about: "AI-built curriculums. Give a topic, where you're starting from, which days you'll study and optionally a finish-by date (\"6 weeks\" or \"Dec 20\"); an Architect model (Claude Sonnet 5.5) writes the modules, each with a diagram and 3 or 4 bullets. Each lesson is a Socratic chat with a Tutor model (Claude Haiku 5.5) that marks the module complete once you've shown you get it (or use Mark done). Recalibrate rewrites the rest more gently when you're stuck. Missed days shift the schedule (with a finish-by date it shows whether you're on track); today's lesson shows at the top of Watch." },
  { key: "longterm", label: "Long Term", where: "Tabs > Once in a while", about: "Seasons (a semester, a summer, a break), each with its plan written at the start and dated updates and reviews along the way." },
  { key: "reminders", label: "Long-Term Reminders", where: "Tabs > Once in a while", about: "Things to remember months out. Each waits here until its \"show from\" day, then joins the reminders banner." },
  { key: "portfolio", label: "Portfolio", where: "Tabs > Once in a while", about: "Edits the public portfolio site's projects, timeline and experience cards; saves go live after the site rebuilds." },
  { key: "watch", label: "Watch", where: "Bottom bar", about: "Outside information, read-only, refreshed on a schedule. Its tabs are listed below." },
  { key: "finances", label: "Finances: Accounts", where: "Bottom bar", about: "Checking balance and transactions, synced from Plaid or entered by hand. Kept out of chat and the review packet." },
  { key: "spending", label: "Spending", where: "Finances", about: "What the owner spends, by category, this month and over the last 30 days. Logged by hand, from chat, or from a priced saved meal." },
  { key: "subscriptions", label: "Subscriptions", where: "Finances", about: "Recurring subscriptions with their price and cadence; added or cancelled by hand or from chat." },
  { key: "talos", label: "Talos Improvements", where: "Settings", about: "A checklist of ideas for improving Talos itself." },
  { key: "weekly-email", label: "Weekly email", where: "Settings", about: "A digest emailed to the owner each week: open reminders and a summary of the last 7 days, with each section switchable." },
];

/** What each kind of Watch tab shows. A Record, so a new WatchKind can't be left out. */
export const WATCH_KINDS: Record<WatchKind, { label: string; about: string }> = {
  espn_team: { label: "Team", about: "a team's recent and upcoming games, live scores and players' season averages, from ESPN" },
  espn_news: { label: "Sports headlines", about: "a league's latest headlines, from ESPN" },
  headlines: { label: "Tech headlines", about: "top stories from Hacker News and chosen RSS feeds" },
  jobs: { label: "Job postings", about: "new postings matching chosen roles and locations, with companies already applied to marked" },
  weather: { label: "Weather", about: "the forecast for a place" },
  transit: { label: "Train departures", about: "live departures for the commute, switching direction at a set time of day, with alerts" },
  newsletter: { label: "Newsletter", about: "the latest issue of a newsletter, read from its public page, with a markets card" },
  calendar: { label: "Google Calendar", about: "upcoming events from chosen Google calendars" },
};

export interface AboutWatchTab {
  title: string;
  kind: WatchKind;
  enabled: boolean;
}

export interface AboutSection {
  title: string;
  lines: string[];
}

/** The About text, in sections. `archived` holds archived tab keys; `watch` is null if it failed to load. */
export function aboutSections(archived: ReadonlySet<string>, watch: AboutWatchTab[] | null): AboutSection[] {
  const tabs = ABOUT_TABS.map((t) => {
    const marks = [t.where, ...(archived.has(t.key) ? ["archived"] : []), ...(t.off ? ["turned off for now"] : [])];
    return `${t.label} (${marks.join(", ")}): ${t.about}`;
  });
  const watchLines =
    watch == null
      ? ["Couldn't load Watch tabs."]
      : watch.length === 0
        ? ["None set up yet."]
        : watch.map((w) => {
            const k = WATCH_KINDS[w.kind];
            return `${w.title} (${k?.label ?? w.kind}${w.enabled ? "" : ", paused"}): ${k?.about ?? "a Watch source"}`;
          });
  return [
    { title: "General", lines: [ABOUT_GENERAL] },
    { title: "Tabs currently supported", lines: tabs },
    { title: "Watch tabs", lines: watchLines },
  ];
}

/** The same sections as plain text, for the clipboard. */
export function aboutText(sections: AboutSection[]) {
  return sections
    .map((s) => `${s.title}:\n${s.title === "General" ? s.lines.join("\n") : s.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");
}
