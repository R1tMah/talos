import { NextResponse } from "next/server";
import type { ChatResponse } from "@/lib/agent/cards";
import { MODEL, run } from "@/lib/agent/run";
import { loadCtx, ownerDb, proposer } from "@/lib/agent/server";
import { isChatTab, type ChatTab } from "@/lib/tabs";
import { isLiftoffCsv } from "@/lib/liftoff";
import type { Json } from "@/lib/database.types";

const PER_MINUTE = 20; // a front-end bug can't loop and burn credits
const MAX_LENGTH = 2000;
// A pasted Liftoff export (lib/liftoff.ts) can be a few weeks of sets; it's parsed by code, never sent to the model.
const MAX_CSV_LENGTH = 200_000;

const failed = (status = 200): NextResponse<ChatResponse> => NextResponse.json({ cards: [{ kind: "failed" }] }, { status });

/** One message in, result cards out. Every outcome is decided by code; see lib/agent/run.ts. */
export async function POST(req: Request): Promise<NextResponse<ChatResponse>> {
  const db = await ownerDb();
  if (!db) return failed(401);

  let body: { text?: unknown; clientMsgId?: unknown; tab?: unknown; fixes?: unknown };
  try {
    body = await req.json();
  } catch {
    return failed(400);
  }
  const text = typeof body.text === "string" ? body.text : "";
  const clientMsgId = typeof body.clientMsgId === "string" ? body.clientMsgId : "";
  if (!text.trim() || text.length > (isLiftoffCsv(text) ? MAX_CSV_LENGTH : MAX_LENGTH) || !clientMsgId) return failed(400);
  // Optional tab chip; anything that isn't a known tab is rejected rather than ignored.
  if (body.tab != null && !isChatTab(body.tab)) return failed(400);
  const tab = body.tab as ChatTab | undefined;
  // Answering "Where does this go?" with a tab: the earlier message (by its clientMsgId)
  // went there. Remembered so a message like it suggests that tab first next time.
  if (tab && typeof body.fixes === "string" && body.fixes && body.fixes !== clientMsgId) {
    await db.from("message_log").update({ corrected: true, corrected_tab: tab }).eq("client_msg_id", body.fixes);
  }

  // The same message sent twice gets the first answer back, not a second write.
  const seen = await db.from("message_log").select("response").eq("client_msg_id", clientMsgId).maybeSingle();
  if (seen.data?.response) return NextResponse.json(seen.data.response as unknown as ChatResponse);

  const recent = await db.from("message_log").select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((recent.count ?? 0) >= PER_MINUTE) return failed(429);

  const logged = await db.from("message_log").insert({ client_msg_id: clientMsgId, text, tab: tab ?? null }).select("id").single();
  if (logged.error) {
    // Lost a race with an identical send.
    const again = await db.from("message_log").select("response").eq("client_msg_id", clientMsgId).maybeSingle();
    return again.data?.response ? NextResponse.json(again.data.response as unknown as ChatResponse) : failed();
  }

  const loaded = await loadCtx(db, text);
  if (!loaded) return failed();

  let response: ChatResponse;
  let meta: { route: string; tool_calls: Json; model: string | null } = { route: "model", tool_calls: [], model: MODEL };
  try {
    const result = await run({ ...loaded.ctx, tab }, loaded.threshold, proposer(db, logged.data.id));
    response = { cards: result.cards };
    meta = { route: result.route, tool_calls: result.calls as unknown as Json, model: result.route === "model" ? MODEL : null };
  } catch {
    response = { cards: [{ kind: "failed" }] };
  }

  await db.from("message_log").update({ ...meta, response: response as unknown as Json }).eq("id", logged.data.id);
  return NextResponse.json(response);
}

const STALE_MS = 3 * 60_000; // past this, a message with no answer stopped partway

/**
 * Where a sent message stands, for the client to pick up a reply it never got (the app
 * was closed or reloaded mid-request): GET ?clientMsgId=…
 * { status: "done", cards } | { status: "working" } | { status: "unknown" } (never arrived) | { status: "failed" }.
 */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clientMsgId = new URL(req.url).searchParams.get("clientMsgId");
  if (!clientMsgId) return NextResponse.json({ error: "clientMsgId required" }, { status: 400 });
  const { data, error } = await db.from("message_log").select("response, created_at").eq("client_msg_id", clientMsgId).maybeSingle();
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  if (!data) return NextResponse.json({ status: "unknown" });
  if (data.response) return NextResponse.json({ status: "done", ...(data.response as unknown as ChatResponse) });
  return NextResponse.json({ status: Date.now() - new Date(data.created_at).getTime() < STALE_MS ? "working" : "failed" });
}
