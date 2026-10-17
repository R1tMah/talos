// The one-time import scripts (#32, #150-#152, #154, #157). They read the owner's notes
// from data/ (gitignored), so these skip on a machine without them.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const has = (f: string) => existsSync(`${ROOT}data/${f}`);

/** Runs an import script; returns the SQL (stdout) and the validation report (stderr). */
function runScript(script: string, input: string) {
  return execFileSync("node", [`scripts/${script}`, `data/${input}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function runWithReport(script: string, input: string) {
  const sql = runScript(script, input);
  const report = execFileSync("sh", ["-c", `node scripts/${script} data/${input} 2>&1 >/dev/null`], { cwd: ROOT, encoding: "utf8" });
  return { sql, report };
}

describe.skipIf(!has("weights.txt"))("20. Weight import", () => {
  const { sql, report } = has("weights.txt") ? runWithReport("import-weights.mts", "weights.txt") : { sql: "", report: "" };

  it("#32 every recomputed weekly average is within 0.1 of the hand-typed one, or flagged", () => {
    expect(report).toContain("all checks passed");
    expect(report).not.toMatch(/FLAG/);
  });

  it('#151 the "6:18" typo imports as 6/18', () => {
    expect(report).toContain("fixed: date typo 6:18 -> 6/18");
    expect(sql).toContain("('2026-06-18', 180.0)");
  });

  it("#157 the gaps stay missing days (no weight rows; the trips are breaks instead)", () => {
    const weightsPart = sql.slice(sql.indexOf("insert into public.weights"), sql.indexOf("insert into public.phases"));
    for (const d of ["2026-07-16", "2026-07-17", "2026-07-18", "2026-08-20", "2026-10-03"]) expect(weightsPart).not.toContain(`'${d}'`);
  });

  it("#150 the import refuses to run on a non-empty table and runs as one transaction", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/raise exception 'weights, phases or breaks is not empty/);
    expect(sql).toMatch(/^commit;/m);
  });
});

describe.skipIf(!has("leetcode.txt"))("20. LeetCode import", () => {
  const sql = has("leetcode.txt") ? runScript("import-leetcode.mts", "leetcode.txt") : "";
  const rows = [...sql.matchAll(/^\s+\('(\d{4}-\d{2}-\d{2})', '((?:[^']|'')*)',/gm)].map((m) => `${m[1]} ${m[2]}`);

  it("#152 duplicated lines import once (the note was pasted twice)", () => {
    expect(rows.length).toBe(76);
    const values = [...sql.matchAll(/^\s+\((.*)\),?$/gm)].map((m) => m[1]);
    expect(new Set(values).size).toBe(values.length);
  });

  it("#153 only the final redo queue is flagged", () => {
    const redo = [...sql.matchAll(/^\s+\('[^']+', '((?:[^']|'')*)', [^\n]*?, (true|false), '/gm)].filter((m) => m[2] === "true").map((m) => m[1]);
    expect(redo.sort()).toEqual(["Majority Element II", "Palindrome Partitioning", "Task Scheduler"]);
  });

  it("#154 the ambiguous 1:13 uses the owner's answer (1 h 13 min), not a guess", () => {
    // Spec: send to an import_review list. The owner answered instead, so the row has 73 minutes.
    expect(sql).toMatch(/\('2026-07-10', 'Decode String', 'medium', false, 73,/);
  });
});

describe.skipIf(!has("callbacks.txt"))("20. Callback import", () => {
  const sql = has("callbacks.txt") ? runScript("import-callbacks.mts", "callbacks.txt") : "";

  it("#62 debriefs in the import are the owner's text byte for byte", () => {
    const note = readFileSync(`${ROOT}data/callbacks.txt`, "utf8");
    for (const line of note.split("\n").filter((l) => l.includes(" — "))) {
      const debrief = line.slice(line.indexOf(" — ") + 3).replaceAll("'", "''");
      expect(sql).toContain(`'${debrief}'`);
    }
  });
});

describe("16. Migrations", () => {
  it("#130 schema changes are additive: no migration drops or retypes a table or column", () => {
    const dir = `${ROOT}supabase/migrations`;
    const offenders = readdirSync(dir).flatMap((f) => {
      const sql = readFileSync(`${dir}/${f}`, "utf8").replace(/--.*$/gm, "");
      return [/\bdrop\s+table\b/i, /\bdrop\s+column\b/i, /\balter\s+column\s+\w+\s+(set\s+data\s+)?type\b/i, /\btruncate\b/i]
        .filter((re) => re.test(sql))
        .map((re) => `${f}: ${re}`);
    });
    expect(offenders).toEqual([]);
  });
});
