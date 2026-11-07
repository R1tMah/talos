import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { reschedule } from "@/lib/learning/server";

/** { moduleId, action: "done" | "reopen" }: the manual Mark done, or undoing a completion. Moves the schedule. */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { moduleId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";
  if (!moduleId || (body.action !== "done" && body.action !== "reopen")) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const mod = await db.from("curriculum_modules").select("curriculum_id, replaced_at").eq("id", moduleId).maybeSingle();
  if (!mod.data || mod.data.replaced_at) return NextResponse.json({ error: "This module was replaced or doesn't exist." }, { status: 404 });
  const res = body.action === "done"
    ? await db.from("curriculum_modules").update({ completed_at: new Date().toISOString(), completed_by: "manual" }).eq("id", moduleId).is("completed_at", null)
    : await db.from("curriculum_modules").update({ completed_at: null, completed_by: null }).eq("id", moduleId);
  if (res.error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  await reschedule(db, mod.data.curriculum_id);
  return NextResponse.json({ ok: true });
}
