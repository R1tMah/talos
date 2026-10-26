// Exports built from rows a screen already loaded (the `source` kind of ExportButton).
// Kept out of the page files so they can be tested; lib/exportLive.ts has the rest.

import type { AppEntry } from "./applicationsData";
import { fmtDuration } from "./duration";
import type { TabExport } from "./exportTab";
import type { Transaction } from "./finances";
import type { Season } from "./seasonsData";
import { paceOf, type Run } from "./runsData";
import { weightLogRows, type LogItem } from "./weightLog";

/** Miles without trailing zeros: 3, 3.1, 3.25. */
export const mi = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export function applicationsExport(rows: AppEntry[]): TabExport {
  return {
    title: "Applications",
    columns: [
      { key: "date", label: "Date" }, { key: "company", label: "Company" }, { key: "position", label: "Position" },
      { key: "status", label: "Status" }, { key: "resume", label: "Resume" },
    ],
    rows: rows.map((a) => ({ date: a.date, company: a.company, position: a.position, status: a.status, resume: a.resume ?? "" })),
  };
}

export function runsExport(runs: Run[]): TabExport {
  return {
    title: "Runs",
    columns: [
      { key: "date", label: "Date" }, { key: "miles", label: "Miles" }, { key: "time", label: "Time" },
      { key: "pace", label: "Pace (/mi)" }, { key: "cal", label: "Calories (est.)" }, { key: "note", label: "Note" },
    ],
    rows: runs.map((r) => ({
      date: r.date, miles: mi(r.miles), time: fmtDuration(r.seconds), pace: fmtDuration(paceOf(r)),
      cal: r.calories == null ? "" : String(r.calories), note: r.note ?? "",
    })),
  };
}

/** PNC checking transactions, newest first. Amounts are signed: negative = spent. */
export function financesExport(txns: Transaction[]): TabExport {
  return {
    title: "Finances",
    columns: [
      { key: "date", label: "Date" }, { key: "amount", label: "Amount" }, { key: "description", label: "What" },
      { key: "category", label: "Category" }, { key: "note", label: "Note" },
    ],
    rows: txns.map((t) => ({
      date: t.date, amount: t.amount.toFixed(2), description: t.description, category: t.category ?? "", note: t.note ?? "",
    })),
  };
}

/** Spreadsheet rows for the CSV; "Copy" uses weightLogText instead. Oldest first. */
export function weightExport(log: LogItem[]): TabExport {
  return {
    title: "Weight",
    columns: [
      { key: "week", label: "Week" }, { key: "date", label: "Date" }, { key: "lb", label: "lb" },
      { key: "week_avg", label: "Week average" }, { key: "note", label: "Note" }, { key: "break", label: "Break" },
    ],
    rows: weightLogRows(log),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "May 17, 2026": Long Term spans years, so the year is always shown. */
const fullDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/** Oldest season first (the order they were written), whatever order the screen shows. */
const inOrder = (seasons: Season[]) => [...seasons].sort((a, b) => a.position - b.position);

/**
 * All of Long Term as markdown, oldest season first: each season's name, its plan, then
 * every update under its heading as written (or its date). The owner's text is copied
 * exactly; only the headings are added.
 */
export function longTermText(seasons: Season[]) {
  const blocks = [`# Long Term, ${seasons.length} ${seasons.length === 1 ? "season" : "seasons"}`];
  for (const s of inOrder(seasons)) {
    blocks.push(`## ${s.name}`);
    if (s.plan.trim()) blocks.push(`### Plan\n${s.plan}`);
    for (const n of s.notes) {
      const head = n.label?.trim() || (n.date ? fullDay(n.date) : "Update");
      blocks.push(`### ${head}\n${n.body}`);
    }
  }
  return blocks.join("\n\n") + "\n";
}

/** Spreadsheet rows, oldest season first: its plan, then one row per update. */
export function longTermExport(seasons: Season[]): TabExport {
  const rows: Record<string, string>[] = [];
  for (const s of inOrder(seasons)) {
    if (s.plan.trim()) rows.push({ season: s.name, date: "", heading: "Plan", text: s.plan });
    for (const n of s.notes) rows.push({ season: s.name, date: n.date ?? "", heading: n.label ?? "", text: n.body });
  }
  return {
    title: "Long Term",
    columns: [{ key: "season", label: "Season" }, { key: "date", label: "Date" }, { key: "heading", label: "Heading" }, { key: "text", label: "Text" }],
    rows,
    body: "text",
  };
}
