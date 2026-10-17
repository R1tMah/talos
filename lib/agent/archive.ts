// Chat never writes to an archived tab. Which tab a tool writes to is named here,
// once; tools that aren't listed (weight, food, saved meals) belong to tabs that
// can't be archived.
import { tabLabel, type TabKey } from "@/lib/tabs";
import type { Db } from "./tools";

const TOOL_TAB: Record<string, TabKey> = {
  log_leetcode: "leetcode",
  log_run: "runs",
  add_application: "applications",
  plan_application: "applications",
  update_application: "applications",
  apply_application_update: "applications",
  log_callback: "callbacks",
};

/** The archivable tab a tool call (or stored proposal) writes to, if any. */
export function tabOf(tool: string, args: Record<string, unknown>): TabKey | null {
  if (tool === "add_note") return args.kind === "journal" ? "journal" : "content";
  return TOOL_TAB[tool] ?? null;
}

export const archivedMessage = (tab: TabKey) => `${tabLabel(tab)} is archived. Unarchive it to log there.`;

/** Archived tabs from the settings row. A failed read counts as none archived. */
export async function loadArchived(db: Db): Promise<ReadonlySet<string>> {
  try {
    const { data } = await db.from("settings").select("archived_tabs").eq("id", 1).single();
    return new Set(data?.archived_tabs ?? []);
  } catch {
    return new Set();
  }
}
