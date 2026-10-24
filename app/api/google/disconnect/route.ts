import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { disconnect } from "@/lib/google/calendar";
import { createAdminClient } from "@/utils/supabase/admin";

/** Revokes Talos's Google access and deletes the stored token. */
export async function POST() {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  try {
    await disconnect(admin);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "disconnect failed" }, { status: 500 });
  }
}
