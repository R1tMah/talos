import { NextResponse } from "next/server";
import type { ChatResponse } from "@/lib/agent/cards";
import { MODEL, run } from "@/lib/agent/run";
import { loadCtx, ownerDb, proposer } from "@/lib/agent/server";
import { isChatTab, type ChatTab } from "@/lib/tabs";
import type { Json } from "@/lib/database.types";

const PER_MINUTE = 20; // a front-end bug can't loop and burn credits
const MAX_LENGTH = 2000;

const failed = (status = 200): NextResponse<ChatResponse> => NextResponse.json({ cards: [{ kind: "failed" }] }, { status });

/** One message in, result cards out. Every outcome is decided by code; see lib/agent/run.ts. */
export async function POST(req: Request): Promise<NextResponse<ChatResponse>> {
  const db = await ownerDb();
  if (!db) return failed(401);

  let body: { text?: unknown; clientMsgId?: unknown; tab?: unknown };
  try {
    body = await req.json();
  } catch {
    return failed(400);
  }
  const text = typeof body.text === "string" ? body.text : "";
  const clientMsgId = typeof body.clientMsgId === "string" ? body.clientMsgId : "";
  if (!text.trim() || text.length > MAX_LENGTH || !clientMsgId) return failed(400);
  // Optional tab chip; anything that isn't a known tab is rejected rather than ignored.
  if (body.tab != null && !isChatTab(body.tab)) return failed(400);
  const tab = body.tab as ChatTab | undefined;

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
