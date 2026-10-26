import { NextResponse, type NextRequest } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { uploadImage } from "@/lib/portfolio/client";

const MAX = 4 * 1024 * 1024; // the site's functions take bodies up to 6 MB; stay well under

/** Uploads a logo for an experience card: raw image bytes, ?name=acme.png. Returns { path }. */
export async function POST(req: NextRequest) {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const type = req.headers.get("content-type") ?? "";
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(name) || !type.startsWith("image/")) {
    return NextResponse.json({ error: "Use a .png, .jpg, .gif, .webp or .svg image." }, { status: 400 });
  }
  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength) return NextResponse.json({ error: "The image is empty." }, { status: 400 });
  if (bytes.byteLength > MAX) return NextResponse.json({ error: "Keep logos under 4 MB." }, { status: 400 });
  try {
    return NextResponse.json({ path: await uploadImage(name, bytes, type) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
