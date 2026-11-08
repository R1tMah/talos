// A database function that runs as the owner (not security definer) can only insert into a
// table the owner has been granted insert on. A missing grant only shows up as a failed write
// at runtime (it happened to workout_log), so check every migration for it.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../../supabase/migrations/", import.meta.url).pathname;
const sql = readdirSync(dir).sort().map((f) => readFileSync(`${dir}${f}`, "utf8").replace(/--.*$/gm, "")).join("\n");

/** Tables with insert granted to authenticated, from every "grant ... insert ... on a, b to authenticated". */
function insertable(): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/grant\s+([a-z,\s()]+?)\s+on\s+(?:table\s+)?([\w.,\s]+?)\s+to\s+[\w,\s]*authenticated/gi)) {
    if (!/\b(insert|all)\b/i.test(m[1])) continue;
    for (const t of m[2].split(",")) out.add(t.trim().replace(/^public\./, ""));
  }
  return out;
}

/** Tables owner-run functions insert into: functions not marked security definer. */
function insertedByInvokerFunctions(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi)) {
    if (/security\s+definer/i.test(m[2])) continue;
    for (const t of m[3].matchAll(/insert\s+into\s+public\.(\w+)/gi)) if (!out.has(t[1])) out.set(t[1], m[1]);
  }
  return out;
}

describe("write grants", () => {
  it("every table an owner-run function inserts into is insertable by the owner", () => {
    const ok = insertable();
    const missing = [...insertedByInvokerFunctions()].filter(([t]) => !ok.has(t)).map(([t, fn]) => `${t} (inserted by ${fn})`);
    expect(missing).toEqual([]);
  });

  it("workout_log in particular", () => expect(insertable().has("workout_log")).toBe(true));
});
