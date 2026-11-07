import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { logUsage } from "@/lib/learning/server";
import { gradeAnswer } from "@/lib/mock/engine";
import { finalScore, yapPenalty, type Rubric } from "@/lib/mock/score";
import { gradesCapped, GRADES_PER_DAY, mockModels } from "@/lib/mock/server";

export const maxDuration = 300;

/**
 * The Grader grades one answer: { questionId, transcription, durationSeconds } -> { answer }.
 * The model grades content only; the Yap Penalty comes from the timer's seconds, in code.
 */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { questionId?: unknown; transcription?: unknown; durationSeconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const transcription = typeof body.transcription === "string" ? body.transcription.trim() : "";
  const duration = Math.floor(Number(body.durationSeconds));
  if (typeof body.questionId !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!transcription) return NextResponse.json({ error: "There's no answer to grade yet." }, { status: 400 });
  if (transcription.length > 20_000) return NextResponse.json({ error: "That answer is too long to grade." }, { status: 400 });
  if (!Number.isFinite(duration) || duration < 0 || duration > 3600) return NextResponse.json({ error: "The timer reading isn't usable." }, { status: 400 });
  if (await gradesCapped(db)) return NextResponse.json({ error: `That's ${GRADES_PER_DAY} grades in the last day. Try again tomorrow.` }, { status: 429 });

  const q = await db.from("mock_questions")
    .select("id, area, question, rubric, target_time_seconds, mock_sessions!inner(company, role, deleted_at)")
    .eq("id", body.questionId).maybeSingle();
  const session = q.data?.mock_sessions as unknown as { company: string; role: string; deleted_at: string | null } | undefined;
  if (!q.data || !session || session.deleted_at) return NextResponse.json({ error: "That question is gone." }, { status: 404 });

  const { grader } = await mockModels(db);
  const rubric = q.data.rubric as unknown as Rubric;
  const res = await gradeAnswer(grader, { company: session.company, role: session.role, bucket: q.data.area, question: q.data.question, rubric, transcription });
  if (res.message) await logUsage(db, res.message);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });

  const target = q.data.target_time_seconds;
  const penalty = yapPenalty(duration, target);
  const graded = res.value;
  const row = await db.from("mock_answers").insert({
    question_id: q.data.id, transcription, duration_seconds: duration, target_time_seconds: target,
    content_score: graded.content, yap_penalty: penalty, final_score: finalScore(graded.content, penalty),
    feedback: { checks: graded.checks, worked: graded.worked, failed: graded.failed, tip: graded.tip } as never, model: res.message.model,
  }).select("id, created_at").single();
  if (row.error) return NextResponse.json({ error: "Couldn't save the grade." }, { status: 500 });
  return NextResponse.json({ answer: { id: row.data.id, created: row.data.created_at, transcription, duration, target, penalty, final: finalScore(graded.content, penalty), graded } });
}
