/** Per-tab export: one tab's entries as markdown (clipboard) or CSV (download). */
import { fmtDay, newestFirst } from "./date";
import { live } from "./stats";
import type { DB } from "./types";

export type ExportTab =
  | "weight" | "nutrition" | "leetcode" | "applications" | "callbacks" | "workouts" | "content" | "journal" | "notes" | "runs";

type Row = Record<string, string>;

export interface TabExport {
  title: string;
  columns: { key: string; label: string }[];
  rows: Row[];
  /** Long free-text column. Markdown shows it under each entry instead of in a table. */
  body?: string;
}

const s = (v: unknown) => (v == null ? "" : String(v));

function build(tab: ExportTab, db: DB): TabExport {
  switch (tab) {
    case "weight":
      return {
        title: "Weight",
        columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "lb", label: "lb" }, { key: "note", label: "Note" }],
        rows: live(db.weight).sort(newestFirst).map((w) => ({ date: w.date, time: w.time, lb: w.lb.toFixed(1), note: s(w.note) })),
      };
    case "nutrition":
      return {
        title: "Nutrition",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "name", label: "Food" }, { key: "cal", label: "kcal" },
          { key: "p", label: "Protein g" }, { key: "c", label: "Carbs g" }, { key: "f", label: "Fat g" }, { key: "source", label: "Source" },
        ],
        rows: live(db.food).sort(newestFirst).map((e) => ({
          date: e.date, time: e.time, name: e.name, cal: s(e.cal), p: s(e.p), c: s(e.c), f: s(e.f), source: e.source,
        })),
      };
    case "leetcode":
      return {
        title: "LeetCode",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "problem", label: "Problem" },
          { key: "difficulty", label: "Difficulty" }, { key: "result", label: "Result" }, { key: "minutes", label: "Minutes" },
          { key: "redo", label: "Redo" }, { key: "inferred", label: "Inferred fields" }, { key: "notes", label: "Notes" },
        ],
        rows: live(db.leetcode).sort(newestFirst).map((l) => ({
          date: l.date, time: l.time, problem: l.problem, difficulty: l.difficulty, result: l.result, minutes: s(l.minutes),
          redo: l.redo ? "yes" : "", inferred: (l.inferred ?? []).join(" "), notes: s(l.notes),
        })),
        body: "notes",
      };
    case "applications":
      return {
        title: "Applications",
        columns: [
          { key: "date", label: "Date" }, { key: "company", label: "Company" }, { key: "role", label: "Role" },
          { key: "status", label: "Status" }, { key: "source", label: "Source" }, { key: "link", label: "Link" },
        ],
        rows: live(db.applications).sort(newestFirst).map((a) => ({
          date: a.date, company: a.company, role: a.role, status: a.status, source: a.source, link: s(a.link),
        })),
      };
    case "callbacks":
      return {
        title: "Callbacks",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "company", label: "Company" },
          { key: "type", label: "Type" }, { key: "stage", label: "Stage" }, { key: "debrief", label: "Debrief" },
        ],
        rows: live(db.callbacks).sort(newestFirst).map((c) => ({
          date: c.date, time: c.time, company: c.company, type: c.type, stage: c.stage, debrief: c.debrief,
        })),
        body: "debrief",
      };
    case "runs":
      // Runs only live in Supabase; the Runs screen always passes its rows as `source`.
      return { title: "Runs", columns: [], rows: [] };
    case "workouts":
      return {
        title: "Workouts",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "plan", label: "Plan" },
          { key: "minutes", label: "Minutes" }, { key: "count", label: "Sets" }, { key: "sets", label: "Set log" },
        ],
        rows: live(db.workouts).sort(newestFirst).map((w) => ({
          date: w.date, time: w.time, plan: w.plan, minutes: s(w.minutes), count: s(w.sets.length),
          sets: w.sets.map((x) => `${x.exercise} ${x.weight || "BW"}x${x.reps}`).join("\n"),
        })),
        body: "sets",
      };
    case "content":
    case "journal":
    case "notes":
      return {
        title: { content: "Content", journal: "Work Journal", notes: "Unsorted notes" }[tab],
        columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "text", label: "Text" }],
        rows: live(db[tab]).sort(newestFirst).map((n) => ({ date: n.date, time: n.time, text: n.text })),
        body: "text",
      };
  }
}

const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** How a short field reads inside a markdown entry heading. */
function headPart(key: string, v: string) {
  if (!v) return "";
  if (key === "date") return fmtDay(v);
  if (key === "minutes") return `${v} min`;
  if (key === "count") return `${v} sets`;
  if (key === "redo") return "in redo queue";
  return v;
}

export const tabMarkdown = (tab: ExportTab, db: DB) => toMarkdown(build(tab, db));

export function toMarkdown(t: TabExport) {
  const head = `# ${t.title}, ${t.rows.length} entries`;
  if (!t.rows.length) return head;

  if (t.body) {
    // Short fields become the entry heading; the long text goes underneath.
    const short = t.columns.filter((c) => !["time", "inferred", t.body].includes(c.key));
    return [
      head,
      ...t.rows.map((r) => {
        const title = short.map((c) => headPart(c.key, r[c.key])).filter(Boolean).join(" · ");
        return `\n### ${title}${r[t.body!] ? `\n${r[t.body!]}` : ""}`;
      }),
    ].join("\n");
  }

  return [
    head,
    "",
    `| ${t.columns.map((c) => c.label).join(" | ")} |`,
    `|${t.columns.map(() => "---").join("|")}|`,
    ...t.rows.map((r) => `| ${t.columns.map((c) => cell(r[c.key])).join(" | ")} |`),
  ].join("\n");
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const tabCsv = (tab: ExportTab, db: DB) => toCsv(build(tab, db));

export function toCsv(t: TabExport) {
  return [t.columns.map((c) => csvCell(c.label)).join(","), ...t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key])).join(","))].join("\n");
}

export const tabCount = (tab: ExportTab, db: DB) => build(tab, db).rows.length;
export const tabTitle = (tab: ExportTab, db: DB) => build(tab, db).title;
