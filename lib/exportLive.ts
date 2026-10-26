"use client";

import { createClient } from "@/utils/supabase/client";
import { toHM } from "./date";
import type { TabExport } from "./exportTab";

/**
 * Full-history exports read straight from Supabase when the export sheet opens,
 * so they never depend on what the screen happens to have loaded (Nutrition, for
 * example, only loads one day). Newest first; deleted rows are left out.
 */
export type LiveTab = "nutrition" | "leetcode" | "callbacks" | "content" | "journal" | "personal" | "talos" | "sysdesign" | "aiassisted";

const s = (v: unknown) => (v == null ? "" : String(v));
const time = (iso: string) => toHM(new Date(iso));

function rowsOrThrow<T>(res: { data: T[] | null; error: unknown }): T[] {
  if (res.error || !res.data) throw new Error("export query failed");
  return res.data;
}

export async function loadExport(tab: LiveTab): Promise<TabExport> {
  const db = createClient();
  switch (tab) {
    case "nutrition": {
      const rows = rowsOrThrow(
        await db.from("food_log").select("*").is("deleted_at", null)
          .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
      );
      return {
        title: "Nutrition",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "name", label: "Food" },
          { key: "cal", label: "kcal" }, { key: "p", label: "Protein g" }, { key: "portions", label: "Portions" },
          { key: "source", label: "Source" },
        ],
        rows: rows.map((r) => ({
          date: r.logical_date, time: time(r.created_at), name: r.description, cal: s(r.calories), p: s(r.protein_g),
          portions: r.amount == null ? "" : `${Number(r.amount)} ${r.unit ?? "serving"}`, source: r.source,
        })),
      };
    }
    case "leetcode": {
      const rows = rowsOrThrow(
        await db.from("leetcode_log").select("*").is("deleted_at", null)
          .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
      );
      return {
        title: "LeetCode",
        columns: [
          { key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "problem", label: "Problem" },
          { key: "difficulty", label: "Difficulty" }, { key: "result", label: "Result" }, { key: "minutes", label: "Minutes" },
          { key: "topic", label: "Topic" }, { key: "hints", label: "Hints" }, { key: "redo", label: "Redo" },
          { key: "inferred", label: "Inferred" }, { key: "notes", label: "Notes" },
        ],
        rows: rows.map((r) => ({
          date: r.logical_date, time: time(r.created_at), problem: r.title, difficulty: s(r.difficulty), result: s(r.result),
          minutes: s(r.minutes), topic: s(r.topic), hints: s(r.hints), redo: r.redo ? "yes" : "", inferred: r.inferred ? "yes" : "",
          notes: s(r.notes),
        })),
        body: "notes",
      };
    }
    case "callbacks": {
      const rows = rowsOrThrow(
        await db.from("callbacks").select("*").is("deleted_at", null)
          .order("logical_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      );
      return {
        title: "Callbacks",
        columns: [
          { key: "date", label: "Date" }, { key: "company", label: "Company" }, { key: "kind", label: "Type" },
          { key: "outcome", label: "Outcome" }, { key: "score", label: "Score" }, { key: "debrief", label: "Debrief" },
        ],
        rows: rows.map((r) => ({
          date: s(r.logical_date), company: r.company, kind: r.kind, outcome: s(r.outcome), score: s(r.score), debrief: s(r.debrief),
        })),
        body: "debrief",
      };
    }
    case "content":
    case "journal":
    case "personal":
    case "talos":
    case "sysdesign":
    case "aiassisted": {
      const rows = rowsOrThrow(
        await db.from("notes").select("*").eq("kind", tab).is("deleted_at", null)
          .order("logical_date", { ascending: false }).order("created_at", { ascending: false }),
      );
      return {
        title: { content: "Content", journal: "Work Journal", personal: "Personal Journal", talos: "Talos Improvements", sysdesign: "System Design Mocks", aiassisted: "AI-Assisted Mocks" }[tab],
        columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "text", label: "Text" }],
        rows: rows.map((r) => ({ date: r.logical_date, time: time(r.created_at), text: r.body })),
        body: "text",
      };
    }
  }
}
