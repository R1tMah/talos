/**
 * Per-tab export: one tab's entries as markdown (clipboard) or CSV (download).
 * Every export is built from Supabase data by the screen (or lib/exportLive.ts);
 * there is no local-data fallback.
 */
import { fmtDay } from "./date";

/** Names the downloaded file: talos-<tab>-<date>.csv. */
export type ExportTab =
  | "weight" | "nutrition" | "leetcode" | "applications" | "callbacks" | "workouts" | "content" | "journal" | "personal" | "talos" | "sysdesign" | "aiassisted" | "notes" | "runs" | "finances" | "longterm";

type Row = Record<string, string>;

export interface TabExport {
  title: string;
  columns: { key: string; label: string }[];
  rows: Row[];
  /** Long free-text column. Markdown shows it under each entry instead of in a table. */
  body?: string;
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

export function toCsv(t: TabExport) {
  return [t.columns.map((c) => csvCell(c.label)).join(","), ...t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key])).join(","))].join("\n");
}
