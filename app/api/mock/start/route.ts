import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { logUsage } from "@/lib/learning/server";
import { writeMock } from "@/lib/mock/engine";
import { areasFor } from "@/lib/mock/score";
import { mockModels, mocksCapped, MOCKS_PER_DAY } from "@/lib/mock/server";

export const maxDuration = 300;

// A base64 PDF this long is about 3 MB: well under the request size limit.
const PDF_MAX_CHARS = 4_200_000;

/**
 * A new mock: { company?, role, includeFit, context?, pdf?: { name, data } } -> { sessionId }.
 * The Architect writes every question in one call (one per area, plus "Why this company?"
 * when includeFit); they're saved in order. The PDF (base64) is read for this call only.
 */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request (the PDF may be too big)." }, { status: 400 });
  }
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const company = s(body.company), role = s(body.role), context = s(body.context);
  const includeFit = body.includeFit !== false;
  const pdfIn = body.pdf as { name?: unknown; data?: unknown } | null | undefined;
  const pdf = pdfIn && typeof pdfIn.data === "string" ? pdfIn.data.replace(/\s/g, "") : null;
  if (company.length > 100) return NextResponse.json({ error: "Company is too long (up to 100 characters)." }, { status: 400 });
  if (!role || role.length > 100) return NextResponse.json({ error: "Role is required (up to 100 characters)." }, { status: 400 });
  if (context.length > 20_000) return NextResponse.json({ error: "The pasted text is too long (up to 20,000 characters)." }, { status: 400 });
  if (pdf && (!pdf.startsWith("JVBER") || pdf.length > PDF_MAX_CHARS)) {
    return NextResponse.json({ error: "That file isn't a PDF, or it's over 3 MB." }, { status: 400 });
  }
  if (await mocksCapped(db)) return NextResponse.json({ error: `That's ${MOCKS_PER_DAY} mocks in the last day. Try again tomorrow.` }, { status: 429 });

  const pdfName = pdf && typeof pdfIn?.name === "string" ? pdfIn.name.slice(0, 200) : null;
  const row = await db.from("mock_sessions").insert({ company, role, include_fit: includeFit, context, pdf_name: pdfName }).select("id").single();
  if (row.error) return NextResponse.json({ error: "Couldn't save the mock." }, { status: 500 });
  const sessionId = row.data.id;
  // A mock with no questions isn't worth keeping.
  const drop = () => db.from("mock_sessions").update({ deleted_at: new Date().toISOString() }).eq("id", sessionId);

  const { architect } = await mockModels(db);
  const res = await writeMock(architect, { company, role, areas: areasFor(includeFit), context, pdf });
  if (res.message) await logUsage(db, res.message);
  if (!res.ok) {
    await drop();
    return NextResponse.json({ error: res.error }, { status: 502 });
  }

  const saved = await db.from("mock_questions").insert(res.value.map((q, i) => ({
    session_id: sessionId, position: i + 1, area: q.area, question: q.question, rubric: q.rubric as never, target_time_seconds: q.target, model: res.message.model,
  })));
  if (saved.error) {
    await drop();
    return NextResponse.json({ error: "Couldn't save the questions." }, { status: 500 });
  }
  return NextResponse.json({ sessionId });
}
