// Learning, server side: the owner's date, usage logging, spend caps and keeping module
// dates on the cadence. Everything runs as the logged-in owner (RLS applies).

import type Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@/lib/agent/tools";
import { logicalDateIn } from "@/lib/date";
import { ARCHITECT_MODEL } from "./architect";
import { scheduleModules } from "./schedule";
import type { ModuleDraft } from "./types";

/** Architect calls (new curriculums + recalibrations) allowed per rolling 24 hours. */
export const ARCHITECT_PER_DAY = 5;
/** Messages to the Tutor allowed per rolling hour. */
export const TUTOR_PER_HOUR = 40;

export async function ownerTimezone(db: Db): Promise<string> {
  const { data } = await db.from("settings").select("timezone").eq("id", 1).single();
  return data?.timezone ?? "America/New_York";
}

/** Records a call's tokens for Settings > API usage. Never throws. */
export async function logUsage(db: Db, message: Pick<Anthropic.Message, "model" | "usage"> | Pick<Anthropic.Beta.BetaMessage, "model" | "usage">) {
  try {
    const u = message.usage;
    const { error } = await db.from("api_usage").insert({
      model: message.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    });
    if (error) console.error(`[learning] usage not logged: ${error.message}`);
  } catch (e) {
    console.error(`[learning] usage not logged: ${String((e as Error).message ?? e).slice(0, 200)}`);
  }
}

const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

/** True when another Architect call would go over the daily cap (counting ones still running). */
export async function architectCapped(db: Db): Promise<boolean> {
  const [calls, running] = await Promise.all([
    db.from("api_usage").select("id", { count: "exact", head: true }).eq("model", ARCHITECT_MODEL).gte("created_at", dayAgo()),
    db.from("curriculums").select("id", { count: "exact", head: true }).eq("status", "generating").gte("created_at", dayAgo()),
  ]);
  return (calls.count ?? 0) + (running.count ?? 0) >= ARCHITECT_PER_DAY;
}

export async function tutorCapped(db: Db): Promise<boolean> {
  const { count } = await db.from("module_messages").select("id", { count: "exact", head: true })
    .eq("role", "user").gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  return (count ?? 0) >= TUTOR_PER_HOUR;
}

/**
 * Rewrites scheduled_date for a curriculum's live modules from the cadence and today, and
 * marks the curriculum done once every live module is finished (active again if one is
 * reopened). Call after any change to its modules.
 */
export async function reschedule(db: Db, curriculumId: string, tz?: string): Promise<boolean> {
  const zone = tz ?? (await ownerTimezone(db));
  const today = logicalDateIn(zone);
  const [cur, mods] = await Promise.all([
    db.from("curriculums").select("cadence, status").eq("id", curriculumId).single(),
    db.from("curriculum_modules").select("id, position, completed_at, replaced_at, scheduled_date").eq("curriculum_id", curriculumId),
  ]);
  if (cur.error || mods.error) return false;
  const dates = scheduleModules(cur.data.cadence, today, mods.data.map((m) => ({
    id: m.id, position: m.position, replaced: !!m.replaced_at,
    completedOn: m.completed_at ? logicalDateIn(zone, new Date(m.completed_at)) : null,
  })));
  const changed = mods.data.filter((m) => !m.replaced_at && !m.completed_at && m.scheduled_date !== dates.get(m.id));
  const results = await Promise.all(changed.map((m) => db.from("curriculum_modules").update({ scheduled_date: dates.get(m.id)! }).eq("id", m.id)));
  if (results.some((r) => r.error)) return false;
  if (cur.data.status === "active" || cur.data.status === "done") {
    const status = dates.size === 0 && mods.data.some((m) => !m.replaced_at) ? "done" : "active";
    if (status !== cur.data.status) await db.from("curriculums").update({ status }).eq("id", curriculumId);
  }
  return true;
}

/** Inserts drafted modules after `afterPosition`, in order. */
export async function insertModules(db: Db, curriculumId: string, drafts: ModuleDraft[], afterPosition: number) {
  return db.from("curriculum_modules").insert(drafts.map((m, i) => ({
    curriculum_id: curriculumId,
    position: afterPosition + i + 1,
    title: m.title,
    objective: m.objective,
    bullets: m.bullets,
    diagram: m.diagram,
    diagram_caption: m.diagram_caption || null,
    opening_question: m.opening_question,
  })));
}
