// Runs a SQL test file against the linked Supabase project through the CLI.
//
// Every file starts with tests/db/_setup.sql (a transaction as the owner, plus the
// ok()/err() helpers) and never commits: the CLI session ends and the transaction
// rolls back, so tests leave no rows behind. Each test is one row of
// (id, ok, detail), and becomes one vitest case.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SqlResult {
  id: string;
  ok: boolean;
  detail: string | null;
}

const ROOT = new URL("../../", import.meta.url).pathname;

// `--linked` goes through Supabase's Management API, which sets up a temporary login role
// on every call. That step sometimes fails ("unexpected login role status 500", or no
// output at all) before any SQL runs, so those failures are retried. A SQL error is never
// retried: it's a real result. Retrying is safe because the file never commits.
const ATTEMPTS = 4;
const SQL_ERROR = /Failed to run sql query/;

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runOnce(path: string): { results: SqlResult[] } | { error: string; retry: boolean } {
  let out: string;
  try {
    out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", path], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110_000,
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    const text = [err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message;
    return { error: text.slice(0, 2000), retry: !SQL_ERROR.test(text) };
  }
  const start = out.indexOf("{");
  if (start < 0) {
    return { error: `The Supabase CLI returned no JSON:\n${out.trim().slice(0, 2000) || "(no output)"}`, retry: true };
  }
  try {
    const json = JSON.parse(out.slice(start));
    const rows = (json.rows ?? []) as { id: string; ok: boolean | string; detail: string | null }[];
    return { results: rows.map((r) => ({ id: r.id, ok: r.ok === true || r.ok === "true", detail: r.detail })) };
  } catch {
    return { error: `The Supabase CLI returned output that isn't JSON:\n${out.trim().slice(0, 2000)}`, retry: true };
  }
}

export function runSqlFile(file: string): { results: SqlResult[]; error: string | null } {
  const setup = readFileSync(join(ROOT, "tests/db/_setup.sql"), "utf8");
  const body = readFileSync(join(ROOT, "tests/db", file), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "talos-sql-"));
  const path = join(dir, file);
  writeFileSync(path, `${setup}\n${body}\nselect id, ok, detail from _t order by n;\n`);
  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const r = runOnce(path);
    if ("results" in r) return { results: r.results, error: null };
    last = r.error;
    if (!r.retry) break;
    if (attempt < ATTEMPTS) sleep(2000 * attempt);
  }
  return { results: [], error: last };
}
