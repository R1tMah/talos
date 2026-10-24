// Exports built from rows a screen already loaded (the `source` kind of ExportButton).
// Kept out of the page files so they can be tested; lib/exportLive.ts has the rest.

import type { AppEntry } from "./applicationsData";
import { fmtDuration } from "./duration";
import type { TabExport } from "./exportTab";
import type { Transaction } from "./finances";
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
