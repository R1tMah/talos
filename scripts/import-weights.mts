// One-time import of the weight note, phases and breaks into SQL.
//
//   node scripts/import-weights.mts data/weights.txt > data/import_weights.sql
//
// Reads the owner's notes-app export, prints a validation report to stderr,
// and writes a single-transaction SQL file to stdout. Nothing touches the
// database; the owner reviews the SQL and applies it.

import { readFileSync } from "node:fs";

const YEAR = 2026;
const TOLERANCE = 0.1;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/import-weights.mts <notes file>");
  process.exit(1);
}
const lines = readFileSync(src, "utf8").split("\n").map((l) => l.trim());

type Weight = { date: string; lb: string };
// A bracketed remark, with the weigh-ins on either side of it.
type Remark = { label: string; after: string | null; before: string | null };

const iso = (m: number, d: number) =>
  `${YEAR}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// "3/23 195.1", "3/28: 195.5", "4/28:186.7", "9/12; 169.4", and the "6:18" typo.
const WEIGHT_LINE = /^(\d{1,2})[/:](\d{1,2})[:;]?\s*(\d{2,3}\.\d)$/;
// "Week 4 average: 191.3", "Week 16: 175.4", "Week 21 average:" (number on next line).
const WEEK_LINE = /^week\s+(\d+)\b[^\d]*?(\d{2,3}\.\d)?$/i;
// "[NY Trip where we ate like a fatass]"
const REMARK_LINE = /^\[(.+)\]$/;

const weights: Weight[] = [];
const typedAverages = new Map<number, number>();
let pendingWeek: number | null = null;
const remarks: Remark[] = [];
const fixes: string[] = [];

for (const line of lines) {
  const w = line.match(WEIGHT_LINE);
  if (w) {
    if (line.includes(`${w[1]}:${w[2]}`) && !line.includes("/")) fixes.push(`date typo ${w[1]}:${w[2]} -> ${w[1]}/${w[2]}`);
    const date = iso(+w[1], +w[2]);
    for (const r of remarks) if (r.before === null) r.before = date;
    weights.push({ date, lb: w[3] });
    continue;
  }
  const wk = line.match(WEEK_LINE);
  if (wk) {
    if (wk[2]) typedAverages.set(+wk[1], +wk[2]);
    else pendingWeek = +wk[1];
    continue;
  }
  if (pendingWeek !== null && /^\d{2,3}\.\d$/.test(line)) {
    typedAverages.set(pendingWeek, +line);
    pendingWeek = null;
    continue;
  }
  const r = line.match(REMARK_LINE);
  if (r) remarks.push({ label: r[1].trim(), after: weights.at(-1)?.date ?? null, before: null });
}

// ---- Validation ------------------------------------------------------------

const problems: string[] = [];

const seen = new Set<string>();
for (const w of weights) {
  if (seen.has(w.date)) problems.push(`duplicate date ${w.date}`);
  seen.add(w.date);
  const lb = +w.lb;
  if (lb < 90 || lb > 400) problems.push(`out of range ${w.date}: ${w.lb}`);
}
for (let i = 1; i < weights.length; i++) {
  if (weights[i].date <= weights[i - 1].date) problems.push(`out of order at ${weights[i].date}`);
}

// ---- Breaks ----------------------------------------------------------------

// Dates confirmed by the owner; labels are the bracketed remarks, verbatim and in order.
const BREAK_DATES: [string, string][] = [
  [iso(7, 16), iso(7, 18)],
  [iso(8, 17), iso(8, 24)],
  [iso(10, 2), iso(10, 5)],
];
if (remarks.length !== BREAK_DATES.length) problems.push(`${remarks.length} remarks but ${BREAK_DATES.length} break date ranges`);
const breaks = BREAK_DATES.map(([start, end], i) => {
  const r = remarks[i];
  // The break must sit where the remark was written, between the surrounding weigh-ins.
  if (r && !(r.after !== null && r.after < start && r.before !== null && r.before > end)) {
    problems.push(`break ${start}..${end} does not sit between ${r.after} and ${r.before} ("${r.label}")`);
  }
  const inside = weights.filter((w) => w.date >= start && w.date <= end);
  if (inside.length) problems.push(`break ${start}..${end} contains weigh-ins: ${inside.map((w) => w.date).join(", ")}`);
  return { start, end, label: r?.label ?? "" };
});

// Monday-start weeks, matching the weekly_weights view.
const mondayOf = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const byWeek = new Map<string, number[]>();
for (const w of weights) {
  const k = mondayOf(w.date);
  byWeek.set(k, [...(byWeek.get(k) ?? []), Math.round(+w.lb * 10)]);
}
// Postgres round(numeric, 1) rounds half away from zero; integer tenths keep this exact.
const round1 = (tenthsSum: number, n: number) => Math.round(tenthsSum / n) / 10;

const report: string[] = [];
[...byWeek.entries()].forEach(([monday, tenths], i) => {
  const week = i + 1;
  const computed = round1(tenths.reduce((a, b) => a + b, 0), tenths.length);
  const typed = typedAverages.get(week);
  const diff = typed === undefined ? 0 : Math.abs(computed - typed);
  const flag = diff > TOLERANCE + 1e-9 ? "  FLAG" : diff > 0 ? "  (off by 0.1, within tolerance)" : "";
  report.push(`week ${String(week).padStart(2)}  ${monday}  n=${tenths.length}  computed=${computed.toFixed(1)}  typed=${typed?.toFixed(1) ?? "-"}${flag}`);
  if (flag === "  FLAG") problems.push(`week ${week} (${monday}) computed ${computed} vs typed ${typed}`);
});

// Spec acceptance test 4.
const check = (monday: string, avg: number, n: number) => {
  const t = byWeek.get(monday) ?? [];
  const got = round1(t.reduce((a, b) => a + b, 0), t.length);
  if (t.length !== n || got !== avg) problems.push(`spot check ${monday}: expected ${avg} n=${n}, got ${got} n=${t.length}`);
};
check(`${YEAR}-03-23`, 196.2, 5);
check(`${YEAR}-03-30`, 194.5, 4);

// ---- Phases ----------------------------------------------------------------

// Descriptions are the owner's own sentences from the note, found by prefix.
const sentence = (prefix: string) => {
  const hit = lines.find((l) => l.startsWith(prefix));
  if (!hit) problems.push(`phase description not found: "${prefix}"`);
  return hit ?? "";
};
const phases = [
  { start: iso(3, 23), end: iso(5, 25), cal: 1800, protein: null, desc: sentence("From 3/23 to 5/26") },
  { start: iso(5, 26), end: iso(8, 14), cal: 2100, protein: null, desc: sentence("From 5/26-8/14") },
  { start: iso(8, 25), end: iso(9, 23), cal: 2250, protein: null, desc: sentence("Now starting 8/25") },
  { start: iso(9, 24), end: null, cal: 2100, protein: 150, desc: sentence("Starting 9/24") },
];

// ---- Report ----------------------------------------------------------------

console.error(`${weights.length} weigh-ins, ${weights[0]?.date} to ${weights.at(-1)?.date}`);
for (const f of fixes) console.error(`fixed: ${f}`);
for (const b of breaks) console.error(`break ${b.start} to ${b.end}: ${b.label}`);
console.error(report.join("\n"));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.error("\nall checks passed");

// ---- SQL -------------------------------------------------------------------

const q = (s: string | null) => (s === null ? "null" : `'${s.replaceAll("'", "''")}'`);
const n = (v: number | null) => (v === null ? "null" : String(v));

const sql = `-- Generated by scripts/import-weights.mts from ${src}. Review before applying.
-- ${weights.length} weights (${weights[0].date} to ${weights.at(-1)!.date}), ${phases.length} phases, ${breaks.length} breaks.
-- Runs as one transaction and refuses to run if any of the three tables already has rows.

begin;

do $$
begin
  if exists (select 1 from public.weights) or exists (select 1 from public.phases) or exists (select 1 from public.breaks) then
    raise exception 'weights, phases or breaks is not empty; import already ran or data exists';
  end if;
end $$;

insert into public.weights (logical_date, weight_lb) values
${weights.map((w) => `  (${q(w.date)}, ${w.lb})`).join(",\n")};

insert into public.phases (start_date, end_date, calorie_target, protein_target_g, description) values
${phases.map((p) => `  (${q(p.start)}, ${q(p.end)}, ${n(p.cal)}, ${n(p.protein)}, ${q(p.desc)})`).join(",\n")};

insert into public.breaks (start_date, end_date, label) values
${breaks.map((b) => `  (${q(b.start)}, ${q(b.end)}, ${q(b.label)})`).join(",\n")};

commit;
`;
process.stdout.write(sql);
