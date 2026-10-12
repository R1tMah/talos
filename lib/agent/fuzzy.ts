// Close-name matching for saved meals: tolerates typos ("protrin" ~ "protein") and
// word forms ("maxed" ~ "max" ~ "maximized"). Only ever used to suggest; a close
// match is shown as "did you mean", never logged on its own.

const STOP = new Set(["a", "an", "the", "my", "of", "with", "and"]);

const tokens = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** 1 = same word, ~0.9 = one extends the other, ~0.8 = a typo away, 0 = unrelated. */
function wordSim(a: string, b: string) {
  if (a === b) return 1;
  const short = Math.min(a.length, b.length);
  if (short >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  let p = 0;
  while (p < short && a[p] === b[p]) p++;
  if (p >= 3 && p / short >= 0.6) return 0.7; // max / maxed / maximized
  const allowed = Math.max(a.length, b.length) <= 5 ? 1 : 2;
  return short >= 4 && editDistance(a, b) <= allowed ? 0.8 : 0;
}

/** How well each side's words are covered by the other's, combined (0 to 1). */
export function nameScore(query: string, name: string) {
  const q = tokens(query);
  const n = tokens(name);
  if (!q.length || !n.length) return 0;
  const cover = (xs: string[], ys: string[]) => xs.reduce((s, x) => s + Math.max(...ys.map((y) => wordSim(x, y))), 0) / xs.length;
  const a = cover(q, n);
  const b = cover(n, q);
  return a + b ? (2 * a * b) / (a + b) : 0;
}

/** The best-matching items above `min`, closest first. */
export function closest<T>(query: string, items: T[], namesOf: (t: T) => string[], min = 0.45, limit = 3) {
  return items
    .map((item) => ({ item, score: Math.max(...namesOf(item).map((n) => nameScore(query, n))) }))
    .filter((x) => x.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
