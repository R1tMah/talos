// One-time import of the LeetCode note into SQL.
//
//   node scripts/import-leetcode.mts data/leetcode.txt > data/import_leetcode.sql
//
// The note is free-form, so entries are listed by hand below. Each entry's notes
// are cut out of the source file between two anchors, so they are verbatim by
// construction. A coverage check fails the run if any line of the note is neither
// inside an entry nor a known skip (date headers, commentary, the redo queue).
//
// Rules (from the spec):
// - Times: mm:ss becomes decimal minutes. Ranges and ambiguous values stay null.
// - Hints: "no hints" is none; one or two small hints (Gemini included) is small;
//   "a few hints" is multiple; unstated is null.
// - Result: only from the owner's wording (optimal, "unoptimal"/"not perfectly
//   optimal" = suboptimal, failed/gave up/looked at the answer = failed). Unstated is null.
// - Difficulty: only where the owner wrote it (M, hard, easies), applied to every row
//   of that problem. Topic stays null until lc_catalog is seeded. inferred is false
//   everywhere, because nothing here came from a model.
// - Redo: the final Redo Queue is the source of truth; only the latest row of each
//   problem in it gets redo = true. Earlier "(REDO)" tags are cleared.

import { readFileSync } from "node:fs";

const YEAR = 2026;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/import-leetcode.mts <notes file>");
  process.exit(1);
}
const text = readFileSync(src, "utf8");

type Hints = "none" | "small" | "multiple" | null;
type Result = "optimal" | "suboptimal" | "failed" | null;
type Diff = "easy" | "medium" | "hard";
interface Entry {
  date: string; // m/d
  title: string; // canonical LeetCode title
  from: string; // start anchor (searched after the previous entry)
  through?: string; // notes run to the end of the line containing this; default: end of `from`'s line
  min: number | null;
  hints: Hints;
  result: Result;
  diff?: Diff; // only where the owner stated it
  review?: string; // reason this row needs the owner's eyes
}

const ms = (m: number, s = 0) => Math.round((m + s / 60) * 100) / 100;

const E: Entry[] = [
  { date: "7/5", title: "Car Fleet", from: "Car Fleet (M)", min: ms(28, 14), hints: "small", result: null, diff: "medium" },
  { date: "7/8", title: "Find K Closest Elements", from: "Find k closest elements", through: "did linear search", min: 21, hints: "none", result: "suboptimal", diff: "medium" },
  { date: "7/8", title: "Lowest Common Ancestor of a Binary Tree", from: "Lowest common ancestor", min: ms(9, 40), hints: null, result: null, diff: "medium" },
  { date: "7/9", title: "K Closest Points to Origin", from: "K closest points to origin", through: "M no hints", min: ms(9, 47), hints: "none", result: null, diff: "medium" },
  { date: "7/9", title: "Task Scheduler", from: "Task scheduler M (REDO", through: "so far off", min: ms(30, 22), hints: null, result: "failed", diff: "medium" },
  { date: "7/10", title: "Range Sum Query 2D - Immutable", from: "Range Sum 2D Immutable", through: "solved earlier", min: ms(51, 34), hints: null, result: null, diff: "medium" },
  { date: "7/10", title: "Decode String", from: "Decode String M:", through: "fuck ass problem", min: 73, hints: null, result: null, diff: "medium" }, // "1:13" = 1 h 13 min (owner)
  { date: "7/11", title: "Insert into a Binary Search Tree", from: "Insert into a binary search tree", through: "time complexity wise", min: ms(10, 30), hints: null, result: null },
  { date: "7/11", title: "Delete Leaves With a Given Value", from: "Delete Leaves with a Given Value", through: "recursive but optimal", min: ms(22, 32), hints: null, result: "optimal" },
  { date: "7/12", title: "Construct Quad Tree", from: "Quad Tree m", through: "small hints not even", min: 35, hints: "small", result: null, diff: "medium" },
  { date: "7/12", title: "Coin Change", from: "Coin change M", through: "little ideas", min: ms(29, 4), hints: null, result: null, diff: "medium" },
  { date: "7/12", title: "Boats to Save People", from: "Num rescue boats M", through: "complicated the fuck", min: ms(32, 49), hints: null, result: null, diff: "medium" },
  { date: "7/13", title: "Reorganize String", from: "Reorganize string M", min: ms(34, 19), hints: "none", result: "optimal", diff: "medium" },
  { date: "7/15", title: "Task Scheduler", from: "Task scheduler redo", min: ms(25, 54), hints: "small", result: null },
  { date: "7/16", title: "Longest Happy String", from: "Longest Happy String M", through: "got it instantly", min: ms(39, 29), hints: "small", result: null, diff: "medium" },
  { date: "7/16", title: "Subsets", from: "Subsets M", through: "in a while.", min: ms(27, 29), hints: "small", result: "optimal", diff: "medium" },
  { date: "7/16", title: "Longest Repeating Character Replacement", from: "Longest Repeating Character Replacement\n", through: "on the sport", min: ms(28, 6), hints: "small", result: null, diff: "medium" },
  { date: "7/17", title: "Number of Connected Components in an Undirected Graph", from: "40:51, number of connected", min: ms(40, 51), hints: null, result: null, diff: "medium" },
  { date: "7/17", title: "Best Time to Buy and Sell Stock II", from: "Buy and sell stock II", through: "instead of greedy", min: ms(40, 59), hints: null, result: "optimal", diff: "medium" },
  { date: "7/21", title: "Asteroid Collision", from: "Asteroid collision", min: ms(28, 7), hints: "small", result: null },
  { date: "7/21", title: "Minimum Size Subarray Sum", from: "Minimum Size Subarray Sum: M", through: "all of these indices", min: ms(26, 2), hints: null, result: null, diff: "medium" },
  { date: "7/23", title: "Valid Sudoku", from: "Valid sudoku M:", through: "ugly code lol", min: ms(18, 37), hints: null, result: null, diff: "medium" },
  { date: "7/23", title: "Longest Substring Without Repeating Characters", from: "Longest Subarray without repeating", through: "instead of the right one", min: ms(25, 13), hints: null, result: null },
  { date: "7/26", title: "Car Pooling", from: "Car Pooling 8:45", min: ms(8, 45), hints: null, result: "suboptimal" },
  { date: "7/26", title: "Majority Element II", from: "Majority Element II 5:53", min: ms(5, 53), hints: null, result: "suboptimal" },
  { date: "7/26", title: "Decode String", from: "Decode string, we redid it", min: ms(23, 12), hints: null, result: "optimal" },
  { date: "7/26", title: "Construct Quad Tree", from: "Quad Tree, we redid it", min: ms(23, 53), hints: null, result: "suboptimal" },
  { date: "7/26", title: "Binary Tree Inorder Traversal", from: "In order traversal", min: null, hints: null, result: null, diff: "easy",
    review: "\"like 7 minutes combined\" for three problems; per-problem time left empty." },
  { date: "7/26", title: "Binary Tree Preorder Traversal", from: "In order traversal", min: null, hints: null, result: null, diff: "easy" },
  { date: "7/26", title: "Binary Tree Postorder Traversal", from: "In order traversal", min: null, hints: null, result: null, diff: "easy" },
  { date: "8/2", title: "Koko Eating Bananas", from: "Koko eating bananas: 24:27", min: ms(24, 27), hints: null, result: null },
  { date: "8/2", title: "Course Schedule", from: "Course Schedule: 20:28", min: ms(20, 28), hints: null, result: null },
  { date: "8/26", title: "Generate Parentheses", from: "Generate Parentnezis", through: "when I gave up lol", min: ms(46, 20), hints: null, result: "failed" },
  { date: "8/31", title: "Subsets II", from: "Subsets II\nDidn’t", through: "build up on it", min: 25, hints: null, result: "failed" },
  { date: "8/31", title: "Copy List with Random Pointer", from: "Copy Linked List with random pointer", through: "all good and stuff", min: 25, hints: null, result: "optimal" },
  { date: "9/1", title: "Permutations", from: "Permutations: solved in 16", min: 16, hints: null, result: null },
  { date: "9/2", title: "Subsets", from: "Subsets: 7:24", min: ms(7, 24), hints: null, result: null },
  { date: "9/2", title: "Subsets II", from: "Subsets II: 8:22", min: ms(8, 22), hints: null, result: null },
  { date: "9/4", title: "Combination Sum", from: "Combination Sum I: 10:16", min: ms(10, 16), hints: "none", result: null },
  { date: "9/4", title: "Combination Sum II", from: "Combination Sum II: 20:47", min: ms(20, 47), hints: null, result: null },
  { date: "9/4", title: "Generate Parentheses", from: "Generate Parenthesis: 14:43", min: ms(14, 43), hints: "none", result: null },
  { date: "9/4", title: "Word Search", from: "Word Search: 19:56", min: ms(19, 56), hints: null, result: null },
  { date: "9/5", title: "Palindrome Partitioning", from: "Palindrome Partitioning: didn’t", min: 25, hints: "small", result: "failed" },
  { date: "9/5", title: "N-Queens", from: "N-Queens: failed", min: null, hints: null, result: "failed" },
  { date: "9/6", title: "N-Queens", from: "N-Queens: 20:05", min: ms(20, 5), hints: "small", result: null },
  { date: "9/7", title: "Course Schedule", from: "24:15: course schedule I", min: ms(24, 15), hints: null, result: null },
  { date: "9/7", title: "Number of Connected Components in an Undirected Graph", from: "Number of Connected Components in an undirected graph: 21:01", min: ms(21, 1), hints: null, result: null },
  { date: "9/7", title: "Redundant Connection", from: "Redundant Connections: 12:17", min: ms(12, 17), hints: null, result: null },
  { date: "9/7", title: "Number of Provinces", from: "Number of Provinces: 13:31", min: ms(13, 31), hints: null, result: null },
  { date: "9/8", title: "Min Cost to Connect All Points", from: "Min cost to connect points:", through: "Failed after 30 minutes", min: 30, hints: null, result: "failed" },
  { date: "9/11", title: "Alien Dictionary", from: "Alien Dictionary: failed", min: 30, hints: null, result: "failed" },
  { date: "9/13", title: "Alien Dictionary", from: "Alien Dictionary\nTried", through: "fully optimal in 25 minutes", min: 25, hints: null, result: "optimal" },
  { date: "9/13", title: "Min Cost to Connect All Points", from: "Min Cost to Connect points:", through: "marginally not optimal", min: 25, hints: null, result: "suboptimal" },
  { date: "9/16", title: "Number of Islands", from: "Number of Islands:", through: "perfect implementation", min: 7, hints: null, result: "optimal" },
  { date: "9/16", title: "Max Area of Island", from: "Max number of islands", through: "wouldn’t work", min: 15, hints: null, result: null },
  { date: "9/16", title: "Rotting Oranges", from: "Rotting Oranges:", through: "got thru it", min: 20, hints: null, result: null },
  { date: "9/17", title: "Pacific Atlantic Water Flow", from: "pacific Atlantic water flow", min: null, hints: null, result: "failed" },
  { date: "9/18", title: "Daily Temperatures", from: "Daily Temperatures:", through: "awkward code", min: null, hints: null, result: "optimal" },
  { date: "9/18", title: "Merge Intervals", from: "Merge Intervals: 14:28", min: ms(14, 28), hints: null, result: null },
  { date: "9/18", title: "Car Pooling", from: "Car pooling: like 7 minutes", min: 7, hints: null, result: null },
  { date: "9/19", title: "Insert Interval", from: "Insert Interval:", through: "sweep line figured out", min: 20, hints: null, result: null },
  { date: "9/19", title: "Next Greater Element I", from: "Next Greater Interval I:", through: "couldn’t find the optimal solution", min: 25, hints: null, result: "suboptimal" },
  { date: "9/19", title: "Shortest Path in Binary Matrix", from: "Shortest Path Binary Matrix:", through: "not the best day lol", min: 25, hints: null, result: "failed" },
  { date: "9/19", title: "Meeting Rooms II", from: "Meeting Rooms II:", through: "kinda crazy but yeah", min: 3, hints: null, result: null },
  { date: "9/21", title: "Permutation in String", from: "Permuatation in String", min: null, hints: null, result: "failed" },
  { date: "9/23", title: "Longest Substring Without Repeating Characters", from: "Longest substring without repeating characters: 5:26", min: ms(5, 26), hints: null, result: null },
  { date: "9/23", title: "Longest Repeating Character Replacement", from: "Longest Repeating Character Replacement: 15:12", min: ms(15, 12), hints: null, result: null },
  { date: "9/25", title: "Minimum Window Substring", from: "Did Minimum Window Substring", min: null, hints: null, result: "failed", diff: "hard" },
  { date: "9/26", title: "Sliding Window Maximum", from: "Did sliding window Maximum", min: null, hints: null, result: "failed", diff: "hard" },
  { date: "9/27", title: "Design Add and Search Words Data Structure", from: "Design Add and Search Word", min: null, hints: null, result: "failed" },
  { date: "9/27", title: "Word Search II", from: "Word Search II hard", min: 50, hints: "multiple", result: "suboptimal", diff: "hard" }, // "45-50" = 50 (owner)
  { date: "9/30", title: "Search in Rotated Sorted Array", from: "Search in Rotated array Binary: 7:00", min: 7, hints: null, result: null },
  { date: "9/30", title: "Find Minimum in Rotated Sorted Array", from: "Find minimum in rotated search array", min: ms(10, 5), hints: null, result: null },
  { date: "9/30", title: "Search a 2D Matrix", from: "Solve in 2D sorted array", min: ms(20, 5), hints: null, result: null },
  { date: "9/30", title: "Find First and Last Position of Element in Sorted Array", from: "Find First And Last Position", min: ms(21, 15), hints: "small", result: null },
  { date: "10/1", title: "Koko Eating Bananas", from: "Koko Eating Bananas: 10:00", min: 10, hints: null, result: null },
];

// Lines that are intentionally not rows.
const SKIP = [
  /^Leetcode Progress:$/,
  /^\d{1,2}\/\d{1,2}(-\d{1,2}\/\d{1,2})?:?$/, // date and week headers
  /^10 \(9 mediums 1 easy\) problems completed$/, // 6/28-7/4 summary: no titles, so no rows
  /^Okay this period is full lock in time\./,
  /^Now I’m studying kahn’s algorithm$/,
  /^Redo Queue:$/,
  /^(Task Scheduler|Majority Element II|Palindrome Partitioning)$/,
];
const REDO_QUEUE = ["Task Scheduler", "Majority Element II", "Palindrome Partitioning"];

// ---- Cut notes out of the source ---------------------------------------------

const problems: string[] = [];
const covered: [number, number][] = [];
const lineEnd = (i: number) => (text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i));

let cursor = 0;
let prevFrom = -1;
const rows = E.map((e) => {
  // Entries sharing one line (the three traversals) reuse the same anchor position.
  const start = e.from === E[E.indexOf(e) - 1]?.from ? prevFrom : text.indexOf(e.from, cursor);
  if (start < 0) {
    problems.push(`anchor not found after position ${cursor}: "${e.from}"`);
    return null;
  }
  let end = lineEnd(start + e.from.length - 1);
  if (e.through) {
    const t = text.indexOf(e.through, start);
    if (t < 0) problems.push(`"through" anchor not found for ${e.title}: "${e.through}"`);
    else end = lineEnd(t);
  }
  covered.push([start, end]);
  prevFrom = start;
  cursor = end;
  const [m, d] = e.date.split("/").map(Number);
  return {
    ...e,
    iso: `${YEAR}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    notes: text.slice(start, end).trim(),
  };
}).filter((r) => r !== null);

// Every non-empty line is inside an entry or a known skip.
let pos = 0;
for (const line of text.split("\n")) {
  const s = pos;
  pos += line.length + 1;
  const t = line.trim();
  if (!t || SKIP.some((re) => re.test(t))) continue;
  if (!covered.some(([a, b]) => a < s + line.length && b > s)) problems.push(`line not imported and not skipped: "${t}"`);
}

// Dates never go backwards.
for (let i = 1; i < rows.length; i++) if (rows[i].iso < rows[i - 1].iso) problems.push(`date goes backwards at ${rows[i].title} ${rows[i].iso}`);

// Owner-stated difficulty applies to every row of that problem.
const diff = new Map<string, Diff>();
for (const r of rows) if (r.diff) diff.set(r.title, r.diff);

// Redo: only the latest row of each problem in the final queue.
const redoIdx = new Set<number>();
for (const t of REDO_QUEUE) {
  const idx = rows.map((r) => r.title).lastIndexOf(t);
  if (idx < 0) problems.push(`redo queue problem has no rows: ${t}`);
  else redoIdx.add(idx);
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

// ---- Report ------------------------------------------------------------------

const titles = new Set(rows.map((r) => r.title));
console.error(`${rows.length} rows, ${titles.size} distinct problems, ${rows[0].iso} to ${rows.at(-1)!.iso}`);
console.error(`results: ${["optimal", "suboptimal", "failed", null].map((k) => `${k ?? "unstated"}=${rows.filter((r) => r.result === k).length}`).join(" ")}`);
console.error(`difficulty known for ${rows.filter((r) => diff.has(r.title)).length} rows`);
console.error(`redo = true: ${[...redoIdx].map((i) => `${rows[i].title} (${rows[i].iso})`).join(", ")}`);
console.error(`\nneeds review:`);
for (const r of rows) if (r.review) console.error(`- ${r.iso} ${r.title}: ${r.review}`);
console.error(`- skipped 6/28-7/4 summary line "10 (9 mediums 1 easy) problems completed" (no titles)`);

// ---- SQL -----------------------------------------------------------------------

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replaceAll("'", "''")}'`);

process.stdout.write(`-- Generated by scripts/import-leetcode.mts from ${src}. Review before applying.
-- ${rows.length} rows (${rows[0].iso} to ${rows.at(-1)!.iso}). Notes are verbatim slices of the source.
-- Runs as one transaction and refuses to run if leetcode_log already has rows.

begin;

do $$
begin
  if exists (select 1 from public.leetcode_log) then
    raise exception 'leetcode_log is not empty; import already ran or data exists';
  end if;
end $$;

insert into public.leetcode_log (logical_date, title, difficulty, inferred, minutes, hints, result, redo, notes) values
${rows
  .map((r, i) => `  (${q(r.iso)}, ${q(r.title)}, ${q(diff.get(r.title))}, false, ${r.min ?? "null"}, ${q(r.hints)}, ${q(r.result)}, ${redoIdx.has(i)}, ${q(r.notes)})`)
  .join(",\n")};

commit;
`);
