// Database tests: each .sql file in this folder runs against the linked Supabase
// project as the owner, inside a transaction that is rolled back. Results come back
// as rows and each row becomes a test. Needs the Supabase CLI to be linked.

import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runSqlFile } from "../helpers/sqlRunner";

const files = readdirSync(new URL("./", import.meta.url).pathname).filter((f) => f.endsWith(".sql") && !f.startsWith("_")).sort();

for (const file of files) {
  describe(file, () => {
    const { results, error } = runSqlFile(file);
    if (error) {
      it("runs", () => expect.fail(error));
      return;
    }
    it("returned results", () => expect(results.length).toBeGreaterThan(0));
    for (const r of results) it(r.id, () => expect(r.ok, r.detail ?? undefined).toBe(true));
  });
}
