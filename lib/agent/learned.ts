// Learning from "Where does this go?" answers. When the owner files an unsure message
// (taps an option, picks a tab, or types one), message_log.corrected_tab records the
// tab. A later unsure message that reads like one of those puts that tab first.
// Word overlap only, no model: cheap, predictable, and easy to see why it matched.

import { isChatTab, type ChatTab } from "@/lib/tabs";
import type { CardOption, ChatCard } from "./cards";
import type { Db } from "./tools";

export interface PastPick {
  text: string;
  tab: string;
}

const STOP = new Set(
  ("a an the i im i'm me my to of in on at for and or but is was it this that with just had have some got did do " +
    "today yesterday tonight morning afternoon evening").split(" "),
);

/** The words that say what a message is about. Numbers count as one word ("168" and "170" both read as a number). */
export function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9$.]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, "");
    if (!w) continue;
    if (/^\$?\d+(\.\d+)?[a-z]*$/.test(w)) out.add(w.startsWith("$") ? "#money" : "#num");
    else if (!STOP.has(w)) out.add(w.replace(/s$/, "")); // "eggs" and "egg" are the same thing
  }
  return out;
}

/** How alike two messages read, 0 to 1 (Jaccard on their words). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

export const MIN_SIMILARITY = 0.5;

/**
 * The tab the owner chose for the past message that reads most like `text`, if one is
 * close enough. A match has to share a real word, not just "a number". Newest wins ties.
 */
export function learnedTab(text: string, past: PastPick[], skip: ReadonlySet<string> = new Set()): ChatTab | null {
  const mine = words(text);
  let best: { tab: ChatTab; score: number } | null = null;
  for (const p of past) {
    if (!isChatTab(p.tab) || skip.has(p.tab)) continue;
    const theirs = words(p.text);
    if (![...mine].some((w) => !w.startsWith("#") && theirs.has(w))) continue;
    const score = similarity(mine, theirs);
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) best = { tab: p.tab, score };
  }
  return best?.tab ?? null;
}

/** The owner's recent answers, newest first. A failed read means nothing learned. */
export async function loadPastPicks(db: Db, limit = 300): Promise<PastPick[]> {
  try {
    const { data } = await db.from("message_log").select("text, corrected_tab").not("corrected_tab", "is", null)
      .order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((r) => ({ text: r.text, tab: r.corrected_tab! }));
  } catch {
    return [];
  }
}

/**
 * Puts the learned tab first on "Where does this go?" cards: an option for that tab
 * moves to the front, and the card carries `suggested` so it can say why (or offer the
 * tab itself when none of the options is in it). Cards asking a narrower question
 * (which saved meal?) have a title and are left alone.
 */
export function suggest(cards: ChatCard[], tab: ChatTab | null): ChatCard[] {
  if (!tab) return cards;
  return cards.map((c) => {
    if (c.kind !== "unsure" || c.title) return c;
    const hit = (o: CardOption) => o.tab === tab;
    return { ...c, suggested: tab, options: [...c.options.filter(hit), ...c.options.filter((o) => !hit(o))] };
  });
}
