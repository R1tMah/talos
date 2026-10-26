import { NextResponse, type NextRequest } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { getContent, portfolioConfigured, PortfolioValidationError } from "@/lib/portfolio/client";
import { addItem, setHidden, updateItem } from "@/lib/portfolio/ops";
import { FILES, type FileName, type Item } from "@/lib/portfolio/types";

const isFile = (v: unknown): v is FileName => FILES.includes(v as FileName);

/** The Portfolio tab reads a file: GET ?file=projects|timeline|cards. */
export async function GET(req: NextRequest) {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!portfolioConfigured()) return NextResponse.json({ configured: false, items: [] });
  const file = req.nextUrl.searchParams.get("file");
  if (!isFile(file)) return NextResponse.json({ error: "file must be projects, timeline or cards" }, { status: 400 });
  try {
    const { items } = await getContent<Item>(file);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/**
 * The Portfolio tab saves a change: { file, op: "add" | "update" | "hide", match?, item?, hidden? }.
 * Validation errors from the site come back as a list to show under the form.
 */
export async function POST(req: Request) {
  if (!(await ownerDb())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { file?: unknown; op?: unknown; match?: unknown; item?: Item; hidden?: unknown };
  if (!isFile(b.file)) return NextResponse.json({ error: "file must be projects, timeline or cards" }, { status: 400 });
  try {
    if (b.op === "add" && b.item) await addItem(b.file, b.item);
    else if (b.op === "update" && typeof b.match === "string" && b.item) await updateItem(b.file, b.match, b.item);
    else if (b.op === "hide" && typeof b.match === "string" && typeof b.hidden === "boolean") await setHidden(b.file, b.match, b.hidden);
    else return NextResponse.json({ error: "bad request" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PortfolioValidationError) return NextResponse.json({ error: "invalid", errors: e.errors }, { status: 422 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
