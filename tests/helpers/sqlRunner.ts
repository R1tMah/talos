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

export function runSqlFile(file: string): { results: SqlResult[]; error: string | null } {
  const setup = readFileSync(join(ROOT, "tests/db/_setup.sql"), "utf8");
  const body = readFileSync(join(ROOT, "tests/db", file), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "talos-sql-"));
  const path = join(dir, file);
  writeFileSync(path, `${setup}\n${body}\nselect id, ok, detail from _t order by n;\n`);
  try {
    const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", path], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110_000,
    });
    const json = JSON.parse(out.slice(out.indexOf("{")));
    const rows = (json.rows ?? []) as { id: string; ok: boolean | string; detail: string | null }[];
    return { results: rows.map((r) => ({ id: r.id, ok: r.ok === true || r.ok === "true", detail: r.detail })), error: null };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    return { results: [], error: (err.stdout || err.stderr || err.message).slice(0, 2000) };
  }
}
