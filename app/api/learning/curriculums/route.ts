import { after, NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { designCurriculum } from "@/lib/learning/architect";
import { logicalDateIn } from "@/lib/date";
import { cadenceLabel, sessionsBetween } from "@/lib/learning/schedule";
import { architectCapped, ARCHITECT_PER_DAY, insertModules, logUsage, ownerTimezone, reschedule } from "@/lib/learning/server";

// The Architect call runs after the response, for up to this long.
export const maxDuration = 300;

/**
 * New curriculum: { topic, context, cadence: number[], targetDate?: "YYYY-MM-DD" } → { id }. The row is saved as
 * 'generating' and returned at once; the Architect fills it in afterwards ('active'), or
 * the row ends 'failed' with a reason the Learning tab shows.
 */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { topic?: unknown; context?: unknown; cadence?: unknown; targetDate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  const cadence = Array.isArray(body.cadence) ? [...new Set(body.cadence)].filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
  if (!topic || topic.length > 200) return NextResponse.json({ error: "Topic is required (up to 200 characters)." }, { status: 400 });
  if (context.length > 2000) return NextResponse.json({ error: "Context is too long (up to 2,000 characters)." }, { status: 400 });
  if (!cadence.length) return NextResponse.json({ error: "Pick at least one day." }, { status: 400 });
  // Optional "finish by": a date after today with at least one session before it.
  const targetDate = typeof body.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate) ? body.targetDate : null;
  if (body.targetDate != null && body.targetDate !== "" && !targetDate) return NextResponse.json({ error: "Finish-by date isn't a date." }, { status: 400 });
  const today = logicalDateIn(await ownerTimezone(db));
  const sessions = targetDate ? sessionsBetween(cadence, today, targetDate) : null;
  if (targetDate && (targetDate <= today || !sessions)) {
    return NextResponse.json({ error: "There are no study days between today and that finish date." }, { status: 400 });
  }
  if (await architectCapped(db)) {
    return NextResponse.json({ error: `That's ${ARCHITECT_PER_DAY} curriculum builds in the last day. Try again tomorrow.` }, { status: 429 });
  }

  const row = await db.from("curriculums").insert({ topic, context, cadence, status: "generating", target_date: targetDate }).select("id").single();
  if (row.error) return NextResponse.json({ error: "Couldn't save the curriculum." }, { status: 500 });
  const id = row.data.id;

  after(async () => {
    const fail = (error: string) => db.from("curriculums").update({ status: "failed", error }).eq("id", id);
    try {
      const res = await designCurriculum({ topic, context, cadenceLabel: cadenceLabel(cadence), deadline: targetDate ? { date: targetDate, sessions: sessions! } : null });
      if (res.message) await logUsage(db, res.message);
      if (!res.ok) return void (await fail(res.error));
      const inserted = await insertModules(db, id, res.value.modules, 0);
      if (inserted.error) return void (await fail("Couldn't save the modules."));
      await db.from("curriculums").update({ title: res.value.title, goal: res.value.goal, status: "active" }).eq("id", id);
      await reschedule(db, id);
    } catch (e) {
      console.error(`[learning] build failed: ${String((e as Error).message ?? e).slice(0, 300)}`);
      await fail("Something went wrong while building it.");
    }
  });

  return NextResponse.json({ id });
}
