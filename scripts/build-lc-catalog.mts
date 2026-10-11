// Builds the lc_catalog seed: the NeetCode 150 plus every problem in leetcode_log.
//
//   node scripts/build-lc-catalog.mts <neetcode .problemSiteData.json> <logged titles file> > data/seed_lc_catalog.sql
//
// Sources, never model memory:
// - title and difficulty: LeetCode's own GraphQL API (one request per problem).
// - topic: the NeetCode category (github.com/neetcode-gh/leetcode .problemSiteData.json);
//   for a problem NeetCode doesn't list, LeetCode's first topic tag.
// The SQL also links existing leetcode_log rows to the catalog and fills their
// difficulty and topic from it. Owner-stated difficulties that disagree with
// LeetCode are reported, not overwritten.

import { readFileSync } from "node:fs";

const [ncPath, loggedPath] = process.argv.slice(2);
if (!ncPath || !loggedPath) {
  console.error("usage: node scripts/build-lc-catalog.mts <neetcode json> <logged titles file>");
  process.exit(1);
}

interface NcProblem { problem: string; pattern: string; link: string; neetcode150?: boolean }
const nc: NcProblem[] = JSON.parse(readFileSync(ncPath, "utf8"));
const slugOf = (link: string) => link.replace(/\/$/, "");
const ncBySlug = new Map(nc.map((p) => [slugOf(p.link), p]));
const ncByName = new Map(nc.map((p) => [p.problem.toLowerCase(), p]));

const logged = readFileSync(loggedPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);

// LeetCode slug from a title: lowercase, drop punctuation, spaces to hyphens.
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-");

// What the owner has typed for these problems, so chat can resolve them later.
const OWNER_ALIASES: Record<string, string[]> = {
  "Boats to Save People": ["num rescue boats"],
  "Construct Quad Tree": ["quad tree"],
  "Range Sum Query 2D - Immutable": ["range sum 2d immutable"],
  "Best Time to Buy and Sell Stock II": ["buy and sell stock ii"],
  "Copy List with Random Pointer": ["copy linked list with random pointer"],
  "Min Cost to Connect All Points": ["min cost to connect points"],
  "Max Area of Island": ["max number of islands"],
  "Shortest Path in Binary Matrix": ["shortest path binary matrix"],
  "Search a 2D Matrix": ["solve in 2d sorted array"],
  "Next Greater Element I": ["next greater interval i"],
  "Lowest Common Ancestor of a Binary Tree": ["lowest common ancestor"],
  "Generate Parentheses": ["generate parenthesis"],
  "Combination Sum": ["combination sum i"],
  "Redundant Connection": ["redundant connections"],
  "Binary Tree Inorder Traversal": ["inorder traversal", "in order traversal"],
  "Binary Tree Preorder Traversal": ["preorder traversal"],
  "Binary Tree Postorder Traversal": ["postorder traversal"],
  "Search in Rotated Sorted Array": ["search in rotated array"],
  "Find Minimum in Rotated Sorted Array": ["find minimum in rotated search array"],
  "Longest Substring Without Repeating Characters": ["longest subarray without repeating characters"],
  "Design Add and Search Words Data Structure": ["design add and search word data structure"],
  "Koko Eating Bananas": ["koko"],
  "Course Schedule": ["course schedule i"],
};

// LeetCode tag names mapped onto NeetCode's categories, so topics use one vocabulary.
const TAG_TO_NEETCODE: Record<string, string> = {
  Array: "Arrays & Hashing",
  "Hash Table": "Arrays & Hashing",
  Tree: "Trees",
  "Binary Tree": "Trees",
  "Depth-First Search": "Graphs",
  "Breadth-First Search": "Graphs",
  "Union Find": "Graphs",
};

// Slugs to fetch: NeetCode 150, then logged problems (matched to NeetCode by name or slug).
const slugs = new Set(nc.filter((p) => p.neetcode150).map((p) => slugOf(p.link)));
const loggedSlug = new Map<string, string>();
for (const t of logged) {
  const s = ncByName.get(t.toLowerCase()) ? slugOf(ncByName.get(t.toLowerCase())!.link) : slugify(t);
  loggedSlug.set(t, s);
  slugs.add(s);
}

interface LcQuestion { title: string; titleSlug: string; difficulty: string; topicTags: { name: string }[] }

async function fetchQuestion(slug: string): Promise<LcQuestion | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
        body: JSON.stringify({
          query: "query q($s:String!){question(titleSlug:$s){title titleSlug difficulty topicTags{name}}}",
          variables: { s: slug },
        }),
      });
      if (res.ok) return (await res.json()).data?.question ?? null;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

const problems: string[] = [];
const rows: { title: string; slug: string; difficulty: string; topic: string; aliases: string[] }[] = [];
for (const slug of slugs) {
  const q = await fetchQuestion(slug);
  await new Promise((r) => setTimeout(r, 250));
  if (!q) {
    problems.push(`LeetCode has no problem with slug "${slug}"`);
    continue;
  }
  const ncp = ncBySlug.get(slug);
  const tag = q.topicTags[0]?.name;
  const topic = ncp?.pattern ?? (tag ? (TAG_TO_NEETCODE[tag] ?? tag) : null);
  if (!topic) problems.push(`no topic for ${q.title}`);
  const aliases = new Set((OWNER_ALIASES[q.title] ?? []).map((a) => a.toLowerCase()));
  if (ncp && ncp.problem.toLowerCase() !== q.title.toLowerCase()) aliases.add(ncp.problem.toLowerCase());
  rows.push({ title: q.title, slug, difficulty: q.difficulty.toLowerCase(), topic: topic ?? "", aliases: [...aliases] });
}

// Every logged title must land on a catalog title exactly (case-insensitive).
const byTitle = new Map(rows.map((r) => [r.title.toLowerCase(), r]));
for (const t of logged) {
  if (!byTitle.has(t.toLowerCase())) {
    const r = rows.find((x) => x.slug === loggedSlug.get(t));
    problems.push(`logged title "${t}" doesn't match LeetCode's title${r ? ` "${r.title}"` : ""}`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const loggedRows = rows.filter((r) => logged.some((t) => t.toLowerCase() === r.title.toLowerCase()));
console.error(`${rows.length} catalog problems (${[...slugs].filter((s) => ncBySlug.get(s)?.neetcode150).length} NeetCode 150, ${loggedRows.length} logged)`);
console.error(`topics from NeetCode: ${rows.filter((r) => ncBySlug.has(r.slug)).length}, from LeetCode tags: ${rows.filter((r) => !ncBySlug.has(r.slug)).map((r) => `${r.title} (${r.topic})`).join(", ") || "none"}`);
console.error(`logged problems: ${["easy", "medium", "hard"].map((d) => `${d}=${loggedRows.filter((r) => r.difficulty === d).length}`).join(" ")}`);

const q = (s: string | null) => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(", ")}]` : "'{}'::text[]");

process.stdout.write(`-- Generated by scripts/build-lc-catalog.mts. Difficulty from LeetCode's API, topic from NeetCode.
-- ${rows.length} problems. Runs as one transaction and refuses to run if lc_catalog has rows.

begin;

do $$
begin
  if exists (select 1 from public.lc_catalog) then
    raise exception 'lc_catalog is not empty; seed already ran';
  end if;
end $$;

insert into public.lc_catalog (title, aliases, difficulty, topic) values
${rows.map((r) => `  (${q(r.title)}, ${arr(r.aliases)}, ${q(r.difficulty)}, ${q(r.topic)})`).join(",\n")};

-- Owner-stated difficulties that disagree with LeetCode (reported, left as the owner wrote them).
create temp table lc_conflicts on commit drop as
select l.logical_date, l.title, l.difficulty as owner_said, c.difficulty as leetcode
from public.leetcode_log l join public.lc_catalog c on lower(c.title) = lower(l.title)
where l.difficulty is not null and l.difficulty <> c.difficulty;

-- Link log rows to the catalog; fill difficulty only where the owner didn't state one.
update public.leetcode_log l
set catalog_id = c.id,
    title = c.title,
    difficulty = coalesce(l.difficulty, c.difficulty),
    topic = c.topic,
    inferred = false
from public.lc_catalog c
where lower(c.title) = lower(l.title);

select * from lc_conflicts;

commit;
`);
