"use client";

// Learning, client side: reads straight from Supabase (RLS: owner only); anything that
// calls a model or moves the schedule goes through /api/learning/*.
//
// Dates shown are computed here from the cadence and today (lib/learning/schedule.ts), so
// a missed day shows up shifted even before the server next rewrites scheduled_date.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { daysBetween, logicalToday, toISO } from "@/lib/date";
import { scheduleModules } from "./schedule";
import { toCurriculum, toModule, type Curriculum, type LearningModule, type TutorEvent, type TutorMessage } from "./types";

/** The logical date (4 AM day start, like the rest of the app) a timestamp falls on. */
const dayOf = (iso: string) => logicalToday(new Date(iso));

export interface CurriculumView extends Curriculum {
  /** Live modules in order (replaced ones excluded), each with its computed date. */
  modules: (LearningModule & { date: string | null })[];
  replaced: LearningModule[];
  done: number;
  /** The first unfinished module, if any. */
  next: (LearningModule & { date: string | null }) | null;
  /** The last unfinished module's date: when it ends at this pace. Null once finished. */
  finish: string | null;
  /** Days the projected finish is past the finish-by date (0 or less = on track); null without one. */
  late: number | null;
}

export function viewOf(c: Curriculum, mods: LearningModule[], today = logicalToday()): CurriculumView {
  const own = mods.filter((m) => m.curriculumId === c.id).sort((a, b) => a.position - b.position);
  const live = own.filter((m) => !m.replacedAt);
  const dates = c.cadence.length
    ? scheduleModules(c.cadence, today, live.map((m) => ({ id: m.id, position: m.position, replaced: false, completedOn: m.completedAt ? dayOf(m.completedAt) : null })))
    : new Map<string, string>();
  const modules = live.map((m) => ({ ...m, date: dates.get(m.id) ?? null }));
  const finish = modules.filter((m) => m.date).at(-1)?.date ?? null;
  return {
    ...c,
    modules,
    replaced: own.filter((m) => m.replacedAt),
    done: modules.filter((m) => m.completedAt).length,
    next: modules.find((m) => !m.completedAt) ?? null,
    finish,
    late: c.targetDate && finish ? daysBetween(c.targetDate, finish) : null,
  };
}

/** Every curriculum (not deleted), newest first, with its modules. Polls while one is being built. */
export function useCurriculums() {
  const [rows, setRows] = useState<CurriculumView[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const [cur, mods] = await Promise.all([
      db.from("curriculums").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      db.from("curriculum_modules").select("*").order("position"),
    ]);
    if (cur.error || mods.error) return setFailed(true);
    setFailed(false);
    const modules = mods.data.map(toModule);
    setRows(cur.data.map((c) => viewOf(toCurriculum(c), modules)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const building = rows?.some((r) => r.status === "generating");
  useEffect(() => {
    if (!building) return;
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [building, reload]);

  return { rows, failed, reload };
}

/** Today's lesson for each active curriculum: its first unfinished module, when it's due today or earlier. */
export const dueToday = (rows: CurriculumView[], today = logicalToday()) =>
  rows.filter((r) => r.status === "active" && r.next?.date && r.next.date <= today).map((r) => ({ curriculum: r, module: r.next! }));

export interface Lesson {
  curriculum: CurriculumView;
  module: LearningModule & { date: string | null };
  messages: TutorMessage[];
  /** 1-based number among live modules. */
  number: number;
}

export function useLesson(moduleId: string) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [failed, setFailed] = useState<false | "missing" | "error">(false);

  const reload = useCallback(async () => {
    const db = createClient();
    const mod = await db.from("curriculum_modules").select("*").eq("id", moduleId).maybeSingle();
    if (mod.error) return setFailed("error");
    if (!mod.data) return setFailed("missing");
    const [cur, mods, msgs] = await Promise.all([
      db.from("curriculums").select("*").eq("id", mod.data.curriculum_id).single(),
      db.from("curriculum_modules").select("*").eq("curriculum_id", mod.data.curriculum_id).order("position"),
      db.from("module_messages").select("*").eq("module_id", moduleId).order("created_at"),
    ]);
    if (cur.error || mods.error || msgs.error) return setFailed("error");
    setFailed(false);
    const view = viewOf(toCurriculum(cur.data), mods.data.map(toModule));
    const live = view.modules.find((m) => m.id === moduleId);
    const replaced = view.replaced.find((m) => m.id === moduleId);
    setLesson({
      curriculum: view,
      module: live ?? { ...(replaced ?? toModule(mod.data)), date: null },
      messages: msgs.data.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, createdAt: m.created_at })),
      number: live ? view.modules.indexOf(live) + 1 : 0,
    });
  }, [moduleId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { lesson, failed, reload };
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Failed" };
  } catch {
    return { ok: false, error: "Couldn't reach Talos. Check your connection." };
  }
}

export const learningApi = {
  create: (topic: string, context: string, cadence: number[], targetDate: string | null) =>
    post<{ id: string }>("/api/learning/curriculums", { topic, context, cadence, targetDate }),
  markDone: (moduleId: string) => post<{ ok: true }>("/api/learning/modules", { moduleId, action: "done" }),
  reopen: (moduleId: string) => post<{ ok: true }>("/api/learning/modules", { moduleId, action: "reopen" }),
  recalibrate: (moduleId: string) => post<{ firstModuleId: string | null }>("/api/learning/recalibrate", { moduleId }),
  /** Hides a curriculum (soft delete). */
  remove: async (id: string) => {
    const { error } = await createClient().from("curriculums").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    return !error;
  },
};

/**
 * Sends one message to the Tutor and calls `onEvent` for each streamed event. Resolves
 * when the turn ends; a network failure arrives as an error event.
 */
export async function askTutor(moduleId: string, text: string, onEvent: (e: TutorEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/learning/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleId, text }) });
  } catch {
    return onEvent({ type: "error", message: "Couldn't reach Talos. Check your connection." });
  }
  if (!res.body) return onEvent({ type: "error", message: "The tutor couldn't answer. Try again." });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let ended = false;
  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const e = JSON.parse(line) as TutorEvent;
        if (e.type === "done" || e.type === "error") ended = true;
        onEvent(e);
      } catch {
        // ignore a malformed line
      }
    }
    if (done) break;
  }
  if (!ended) onEvent({ type: "error", message: "The connection dropped. Your message was saved; try again." });
}

/** "Finish by Dec 20 · on track", "Finish by Dec 20 · ends Jan 5 at this pace", or null without a finish-by date. */
export function timelineLabel(c: Pick<CurriculumView, "targetDate" | "finish" | "late" | "status">): string | null {
  if (!c.targetDate) return null;
  const by = `Finish by ${shortDate(c.targetDate)}`;
  if (c.status === "done" || !c.finish) return by;
  return c.late != null && c.late > 0 ? `${by} · ends ${shortDate(c.finish)} at this pace` : `${by} · on track`;
}

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Today", "Tomorrow", "Wed, Nov 11". */
export function dayLabel(date: string, today = logicalToday()) {
  if (date === today) return "Today";
  const t = new Date(`${today}T12:00:00`);
  t.setDate(t.getDate() + 1);
  if (date === toISO(t)) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
