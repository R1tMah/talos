import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { authUrl, googleConfigured, STATE_COOKIE } from "@/lib/google/calendar";

/** Starts Google sign-in. `next` is the in-app page to come back to. */
export async function GET(req: NextRequest) {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set" }, { status: 500 });

  const next = req.nextUrl.searchParams.get("next");
  const back = next && next.startsWith("/") && !next.startsWith("//") ? next : "/watch";
  // The state ties Google's redirect back to this browser (CSRF); it rides in a short-lived cookie.
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(req.nextUrl.origin, state));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, back }), {
    httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/google", maxAge: 600,
  });
  return res;
}
