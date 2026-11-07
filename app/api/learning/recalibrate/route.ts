import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { recalibrate } from "@/lib/learning/architect";
import { logicalDateIn } from "@/lib/date";
import { sessionsBetween } from "@/lib/learning/schedule";
import { architectCapped, ARCHITECT_PER_DAY, insertModules, logUsage, ownerTimezone, reschedule } from "@/lib/learning/server";
import { toCurriculum, toModule, type LearningModule, type ModuleDraft } from "@/lib/learning/types";

export const maxDuration = 300;

const draftOf = (m: LearningModule): ModuleDraft => ({
  title: m.title, objective: m.objective, bullets: m.bullets, diagram: m.diagram,
  diagram_caption: m.diagramCaption ?? "", opening_question: m.openingQuestion,
});

/**
 * Recalibrate: { moduleId } → { firstModuleId }. The Architect reads the learner's chat on
 * the stuck module and writes gentler modules for it and everything after it. The old ones
 * are kept with replaced_at set (shown as "replaced" on the curriculum page).
 */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { moduleId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";
  if (!moduleId) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const modRow = await db.from("curriculum_modules").select("*").eq("id", moduleId).maybeSingle();
  if (!modRow.data || modRow.data.replaced_at) return NextResponse.json({ error: "This module was already replaced." }, { status: 409 });
  const stuck = toModule(modRow.data);
  const [curRow, all, chat] = await Promise.all([
    db.from("curriculums").select("*").eq("id", stuck.curriculumId).single(),
    db.from("curriculum_modules").select("*").eq("curriculum_id", stuck.curriculumId).order("position"),
    db.from("module_messages").select("role, content").eq("module_id", moduleId).order("created_at"),
  ]);
  if (curRow.error || all.error || chat.error) return NextResponse.json({ error: "Couldn't load the curriculum." }, { status: 500 });
  if (await architectCapped(db)) {
    return NextResponse.json({ error: `That's ${ARCHITECT_PER_DAY} curriculum builds in the last day. Try again tomorrow.` }, { status: 429 });
  }
  const cur = toCurriculum(curRow.data);
  const live = all.data.map(toModule).filter((m) => !m.replacedAt);
  const remaining = live.filter((m) => m.position > stuck.position && !m.completedAt);
  // A finish-by date still ahead: the sessions left until it, counted from today.
  const today = logicalDateIn(await ownerTimezone(db));
  const deadline = cur.targetDate && cur.targetDate >= today
    ? { date: cur.targetDate, sessions: sessionsBetween(cur.cadence, today, cur.targetDate) }
    : null;

  const res = await recalibrate({
    topic: cur.topic, context: cur.context, title: cur.title ?? cur.topic, goal: cur.goal ?? "",
    finished: live.filter((m) => m.completedAt && m.id !== stuck.id).map((m) => m.title),
    stuck: draftOf(stuck),
    transcript: chat.data.map((c) => ({ role: c.role as "user" | "assistant", content: c.content })),
    remaining: remaining.map(draftOf),
    deadline,
  });
  if (res.message) await logUsage(db, res.message);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });

  // Replace the stuck module (unless it was finished) and everything still to come.
  const replaceIds = [...(stuck.completedAt ? [] : [stuck.id]), ...remaining.map((m) => m.id)];
  const now = new Date().toISOString();
  if (replaceIds.length) {
    const r = await db.from("curriculum_modules").update({ replaced_at: now, scheduled_date: null }).in("id", replaceIds);
    if (r.error) return NextResponse.json({ error: "Couldn't replace the old modules." }, { status: 500 });
  }
  const after = Math.max(...all.data.map((m) => m.position));
  const inserted = await insertModules(db, cur.id, res.value, after);
  if (inserted.error) {
    // Put the old modules back rather than leave a gap.
    if (replaceIds.length) await db.from("curriculum_modules").update({ replaced_at: null }).in("id", replaceIds);
    return NextResponse.json({ error: "Couldn't save the new modules." }, { status: 500 });
  }
  if (cur.status === "done") await db.from("curriculums").update({ status: "active" }).eq("id", cur.id);
  await reschedule(db, cur.id);
  const first = await db.from("curriculum_modules").select("id").eq("curriculum_id", cur.id).eq("position", after + 1).single();
  return NextResponse.json({ firstModuleId: first.data?.id ?? null });
}
