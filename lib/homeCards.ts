// The TALOS home cards and the rows each can show, named once. Settings > Home cards turns
// rows on and off per card (stored in public.home_cards); a card the owner hasn't touched
// shows its defaults, which are what each card showed before this was customizable.
// Archiving still decides whether a tab's rows can show at all. Pure: no React, no Supabase.

import { CLASSES } from "./chess";
import { GROUPS } from "./tabGroups";

export interface CardRowDef {
  key: string;
  label: string; // in Settings: says what the row shows
  on: boolean; // shown by default
}

export interface CardDef {
  key: string;
  title: string;
  rows: CardRowDef[];
}

export const HOME_CARDS = [
  { key: "weight", title: "Weight", rows: [
    { key: "thisWeek", label: "This week's average", on: true },
    { key: "lastWeek", label: "Last week's average", on: true },
  ] },
  { key: "nutrition", title: "Nutrition", rows: [
    { key: "target", label: "Calorie target", on: true },
    { key: "protein", label: "Protein vs target", on: true },
    { key: "lifts", label: "Workouts this week (Lifts)", on: true },
  ] },
  { key: "runs", title: "Runs", rows: [
    { key: "count", label: "Runs this week", on: true },
    { key: "last", label: "Last run", on: true },
  ] },
  { key: "recruiting", title: "Recruiting", rows: [
    { key: "interviews", label: "Interviews", on: true },
    { key: "oas", label: "Online assessments", on: true },
    { key: "recruiter", label: "Recruiter calls", on: true },
    // Before: shown only when Callbacks was archived. Untouched, that's still how it behaves.
    { key: "statuses", label: "Applications by status", on: false },
  ] },
  { key: "journals", title: "Journals", rows: GROUPS.journals.map((j) => ({ key: j.key, label: `${j.label} entries`, on: true })) },
  { key: "learning", title: "Learning", rows: [
    { key: "next", label: "Next lesson", on: true },
    { key: "active", label: "Active curriculums", on: true },
  ] },
  { key: "experiences", title: "Recommendations", rows: [
    { key: "latest", label: "Latest experience", on: true },
    { key: "done", label: "Experiences logged", on: true },
  ] },
  { key: "chess", title: "Chess", rows: CLASSES.map((c) => ({ key: c.key, label: `${c.label} rating`, on: true })) },
  { key: "longterm", title: "Long Term", rows: [{ key: "current", label: "Current season", on: true }] },
  { key: "reminders", title: "Long-Term Reminders", rows: [{ key: "next", label: "Next one to show up", on: true }] },
  { key: "letters", title: "Future Letters", rows: [{ key: "next", label: "Next to unlock", on: true }] },
] as const satisfies readonly CardDef[];

export type HomeCard = (typeof HOME_CARDS)[number]["key"];
export const cardDef = (key: string): CardDef | undefined => (HOME_CARDS as readonly CardDef[]).find((c) => c.key === key);

/** The owner's picks: card key -> the row keys to show. A card that's missing uses its defaults. */
export type CardConfig = Partial<Record<string, string[]>>;

/** The row keys a card shows under this config. */
export function shownRows(card: string, config: CardConfig | null): Set<string> {
  const def = cardDef(card);
  const picked = config?.[card];
  if (picked) return new Set(picked);
  return new Set(def?.rows.filter((r) => r.on).map((r) => r.key) ?? []);
}

/** A row as the home page builds it: `key` from the registry, plus what StatCard needs. */
export interface KeyedRow<V> {
  key: string;
  label: string;
  value: V;
  /** Untouched card only: show this row even if it's off by default (a fallback, e.g. when another tab is archived). */
  fallback?: boolean;
}

/** The rows of `card` to show, in the order given. Customized cards show exactly what was picked. */
export function pickRows<V>(card: string, config: CardConfig | null, rows: KeyedRow<V>[]): { label: string; value: V }[] {
  const customized = !!config?.[card];
  const on = shownRows(card, config);
  return rows.filter((r) => on.has(r.key) || (!customized && r.fallback)).map(({ label, value }) => ({ label, value }));
}

/** Only known rows, once each, in the registry's order: what gets saved. */
export function cleanPick(card: string, keys: string[]): string[] {
  const def = cardDef(card);
  return def ? def.rows.map((r) => r.key).filter((k) => keys.includes(k)) : [];
}
