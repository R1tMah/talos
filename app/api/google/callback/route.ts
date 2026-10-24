import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { connect, STATE_COOKIE } from "@/lib/google/calendar";
import { createAdminClient } from "@/utils/supabase/admin";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the owner back here after sign-in. Stores the token, then returns to the app. */
export async function GET(req: NextRequest) {
  let saved: { state?: string; back?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  const back = saved.back ?? "/watch";
  const done = (result: "connected" | "denied" | "failed") => {
    const url = new URL(back, req.nextUrl.origin);
    url.searchParams.set("google", result);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return done("denied"); // the owner pressed Cancel on Google's screen
  const code = p.get("code"), state = p.get("state");
  if (!code || !state || !saved.state || !same(state, saved.state)) return done("failed");
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return done("failed");
  try {
    await connect(admin, req.nextUrl.origin, code);
    return done("connected");
  } catch (e) {
    console.error(`[google] connect failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    return done("failed");
  }
}
