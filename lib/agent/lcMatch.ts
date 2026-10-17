// Matching a LeetCode problem name the owner typed against the catalog.
//
// The general fuzzy matcher is too loose for problem titles ("2sum" ~ "3Sum",
// "house robber 2" preferring "House Robber"), so titles get their own rules:
// words compare by stem or by prefix ("min" ~ "minimum", "parenthesis" ~
// "parentheses"), numbers must match exactly (2 = ii), and filler words are
// ignored. Only a clear winner is taken without asking.

const FILLER = new Set(["a", "an", "and", "the", "of", "in", "to", "for", "on", "problem", "leetcode", "lc"]);
const NUMERALS: Record<string, string> = { "1": "i", "2": "ii", "3": "iii", "4": "iv", one: "i", two: "ii", three: "iii", four: "iv" };
const ROMAN = new Set(["i", "ii", "iii", "iv"]);

const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "").replace(/is$/, "");

/** "House Robber 2" -> ["house", "robber", "ii"]; "Valid Parentheses" -> ["valid", "parenth"]. */
export function titleWords(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => {
      // A trailing number names a variant ("house robber 2"); inside a word it's part of the name ("3sum").
      const n = NUMERALS[w];
      return n ?? (ROMAN.has(w) ? w : stem(w));
    });
}

const isNumberish = (w: string) => ROMAN.has(w) || /\d/.test(w);

function wordsMatch(a: string, b: string) {
  if (a === b) return true;
  if (isNumberish(a) || isNumberish(b)) return false; // numbers and variants only match exactly
  return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));
}

/** 0..1: how well the typed name and a catalog title cover each other's words. */
export function titleScore(typed: string, title: string): number {
  const q = titleWords(typed);
  const t = titleWords(title);
  if (!q.length || !t.length) return 0;
  const recall = q.filter((w) => t.some((x) => wordsMatch(w, x))).length / q.length;
  const precision = t.filter((w) => q.some((x) => wordsMatch(w, x))).length / t.length;
  return recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
}

export interface CatalogEntry {
  title: string;
  aliases: string[];
  difficulty: string | null;
}

export type LcMatch<T extends CatalogEntry> =
  | { kind: "match"; entry: T } // a clear winner: use it without asking
  | { kind: "options"; entries: T[] } // close candidates: the owner picks (or keeps their own wording)
  | { kind: "none" };

const AUTO = 0.95; // score needed to take a match without asking
const LEAD = 0.15; // and how far it must lead the next title
const SHOW = 0.5; // lowest score worth offering as "Did you mean"

export function matchTitle<T extends CatalogEntry>(typed: string, catalog: T[]): LcMatch<T> {
  const scored = catalog
    .map((entry) => ({ entry, score: Math.max(...[entry.title, ...entry.aliases].map((n) => titleScore(typed, n))) }))
    .filter((x) => x.score >= SHOW)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { kind: "none" };
  const [top, next] = scored;
  if (top.score >= AUTO && (!next || top.score - next.score >= LEAD)) return { kind: "match", entry: top.entry };
  return { kind: "options", entries: scored.slice(0, 3).map((x) => x.entry) };
}
