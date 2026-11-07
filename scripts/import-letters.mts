// One-time import of FutureMe letters into Future Letters.
//
//   node --env-file=.env.local scripts/import-letters.mts ~/Downloads/futureme-letters-2026-11-06.csv          (dry run)
//   node --env-file=.env.local scripts/import-letters.mts ~/Downloads/futureme-letters-2026-11-06.csv --write
//
// Reads FutureMe's CSV export (Created_at, Send_date, Email, Subject, Body), turns each
// HTML body into plain text with its paragraphs, and prints one line per letter: its
// dates, whether it's delivered or still sealed, and its length. It never prints a
// letter's text. With --write it saves them with the service key (the app can't: it
// refuses past dates), skipping any already imported (same written time):
//   - delivered (send date passed): opened and marked emailed, as FutureMe already sent it;
//   - still to come: sealed until its send date, like a letter written in Talos.
// The text goes straight from the file to the database; nothing is written to the repo.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const src = process.argv[2];
const write = process.argv.includes("--write");
if (!src) {
  console.error("usage: node --env-file=.env.local scripts/import-letters.mts <futureme csv> [--write]");
  process.exit(1);
}

/** RFC 4180: quoted fields, "" for a quote, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", apos: "'", "#39": "'" };

/** FutureMe's HTML as plain text: one line per paragraph or line break, blank lines kept to one. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "2025-12-11 21:43:49 -0500" → a Date. */
function parseCreated(s: string): Date | null {
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  return m ? new Date(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`) : null;
}

/** The send date at the clock time it was written (this machine's timezone, so DST doesn't shift it). */
function deliverAt(send: string, created: string): Date | null {
  const d = send.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = created.trim().match(/ (\d{2}):(\d{2}):(\d{2}) [+-]\d{4}$/);
  if (!d || !t) return null;
  return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +t[3]);
}

const [header, ...rows] = parseCsv(readFileSync(src, "utf8"));
const want = ["Created_at", "Send_date", "Email", "Subject", "Body"];
if (header.join(",") !== want.join(",")) {
  console.error(`Unexpected columns: ${header.join(", ")}\nExpected: ${want.join(", ")}`);
  process.exit(1);
}

const now = new Date();
const fmt = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
const letters: { written: Date; deliver: Date; body: string; delivered: boolean }[] = [];
let bad = 0;
rows.forEach((r, i) => {
  const written = parseCreated(r[0] ?? "");
  const deliver = deliverAt(r[1] ?? "", r[0] ?? "");
  const body = htmlToText(r[4] ?? "");
  if (!written || !deliver || !body) {
    console.error(`row ${i + 2}: skipped (${!written ? "bad Created_at" : !deliver ? "bad Send_date" : "empty letter"})`);
    bad++;
    return;
  }
  letters.push({ written, deliver, body, delivered: deliver <= now });
});

console.log(`${letters.length} letters${bad ? `, ${bad} skipped` : ""}:`);
for (const l of letters.sort((a, b) => a.written.getTime() - b.written.getTime())) {
  // Dates and length only. Never the text.
  console.log(`  written ${fmt(l.written)}  →  ${l.delivered ? "delivered" : "SEALED until"} ${fmt(l.deliver)}  (${l.body.length.toLocaleString()} characters)`);
}

if (!write) {
  console.log("\nDry run: nothing saved. Run again with --write to import.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (run with --env-file=.env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const existing = await db.from("future_letters").select("written_at");
if (existing.error) {
  console.error(`Couldn't read future_letters: ${existing.error.message}. Is the migration applied?`);
  process.exit(1);
}
const have = new Set(existing.data.map((r: { written_at: string }) => new Date(r.written_at).getTime()));
const fresh = letters.filter((l) => !have.has(l.written.getTime()));
if (!fresh.length) {
  console.log("\nAll of these are already imported.");
  process.exit(0);
}

const { error } = await db.from("future_letters").insert(
  fresh.map((l) => ({
    body: l.body,
    written_at: l.written.toISOString(),
    deliver_at: l.deliver.toISOString(),
    // FutureMe already delivered these: open, and emailed, so the cron doesn't send them again.
    opened_at: l.delivered ? l.deliver.toISOString() : null,
    emailed_at: l.delivered ? l.deliver.toISOString() : null,
  })),
);
if (error) {
  console.error(`Import failed, nothing saved: ${error.message}`);
  process.exit(1);
}
console.log(`\nImported ${fresh.length} (${fresh.filter((l) => l.delivered).length} delivered, ${fresh.filter((l) => !l.delivered).length} sealed)${letters.length - fresh.length ? `; ${letters.length - fresh.length} were already there` : ""}.`);
