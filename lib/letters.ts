// Future Letters: the dates. A letter unlocks on its delivery date at the time of day
// it was sealed (sealed at 10:32 PM, it opens at 10:32 PM that day). Device clock.

import { fromISO, todayISO } from "./date";

/** `date` (YYYY-MM-DD) at `at`'s time of day. */
export function atTimeOf(date: string, at: Date): Date {
  const d = fromISO(date);
  d.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), 0);
  return d;
}

/** When a letter sealed at `sealedAt` for `date` unlocks. */
export const unlockAt = (date: string, sealedAt = new Date()) => atTimeOf(date, sealedAt);

/** When an imported letter was written: its date at this time of day, never later than now. */
export function writtenAt(date: string | null, now = new Date()): Date {
  if (!date) return now;
  const d = atTimeOf(date, now);
  return d > now ? now : d;
}

/**
 * A Ctrl+A copy of a FutureMe letter page also picks up the page around the letter: the
 * site menu and the letter's details above it (dates, word count, recipients, ending in
 * "Visibility: Private"), and the "Share letter" / privacy panel and footer below it.
 * Both are cut, so only the letter is sealed. Text without them is returned unchanged.
 */
export function stripFutureMeChrome(text: string): string {
  let out = text;
  const tail = out.match(/\n[ \t]*Share letter[ \t]*\n[\s\S]*?Generate a unique URL where your friends and family can read your letter/);
  if (tail?.index != null) out = out.slice(0, tail.index);
  // The header only counts near the top, and only with FutureMe's own labels.
  const head = out.slice(0, 1500).match(/Recipients:[\s\S]*?\n[ \t]*Visibility:[ \t]*\n?[ \t]*(?:Private|Public)[ \t]*\n/);
  if (head?.index != null) out = out.slice(head.index + head[0].length);
  return out === text ? text : out.trim();
}

export interface SealInput {
  body: string;
  deliverDate: string;
  writtenDate: string | null;
}

/** Why a letter can't be sealed yet, or null. */
export function sealProblem(v: SealInput, now = new Date()): string | null {
  if (!v.body.trim()) return "The letter is empty.";
  if (!v.deliverDate) return "Pick when it unlocks.";
  if (v.writtenDate && v.writtenDate > todayISO()) return "The written date can't be in the future.";
  if (unlockAt(v.deliverDate, now) <= now) return "Pick a later date: it has to unlock in the future.";
  return null;
}

/** Why a sealed letter can't move to `date`, or null. Later only: no early peeks. */
export function postponeProblem(current: Date, date: string): string | null {
  if (!date) return "Pick a date.";
  return atTimeOf(date, current) <= current ? "A sealed letter can only be pushed later." : null;
}

/** "in 3 days", "in 2 months", "in 4 years", "today". */
export function untilText(when: Date, now = new Date()): string {
  const days = Math.round((when.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `in ${months} months`;
  return `in ${Math.round(days / 365.25)} years`;
}
