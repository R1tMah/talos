import { NextResponse } from "next/server";
import type { ConfirmResponse } from "@/lib/agent/cards";
import { commitCard } from "@/lib/agent/run";
import { ownerDb, proposer } from "@/lib/agent/server";
import { TOOLS, type Resolved } from "@/lib/agent/tools";

const failed = (detail?: string, status = 200): NextResponse<ConfirmResponse> =>
  NextResponse.json({ cards: [{ kind: "failed", detail }] }, { status });

/**
 * Commits a stored proposal: "Yes, save", Confirm, a pick from "Where does this go?",
 * or a missing-fields card with its values. The client only sends the proposal id
 * (and values for the fields that were missing); what gets written comes from the server.
 */
export async function POST(req: Request): Promise<NextResponse<ConfirmResponse>> {
  const db = await ownerDb();
  if (!db) return failed(undefined, 401);

  let body: { proposalId?: unknown; values?: unknown };
  try {
    body = await req.json();
  } catch {
    return failed(undefined, 400);
  }
  if (typeof body.proposalId !== "string") return failed(undefined, 400);

  // Claim it in the same statement that checks it, so a double tap can't commit twice.
  const claimed = await db
    .from("pending_proposals")
    .update({ used_at: new Date().toISOString() })
    .eq("id", body.proposalId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("tool, args, message_id")
    .maybeSingle();
  if (!claimed.data) return failed("This was already handled or has expired.");

  const { tool: name, message_id } = claimed.data;
  const { _option, ...stored } = claimed.data.args as Resolved;
  const tool = TOOLS[name];
  if (!tool) return failed();

  let resolved: Resolved = stored;
  if (body.values && typeof body.values === "object") {
    if (!tool.fill) return failed(undefined, 400);
    const filled = tool.fill(stored, body.values as Record<string, unknown>);
    if (typeof filled === "string") {
      // Give the proposal back so the owner can fix the value and try again.
      await db.from("pending_proposals").update({ used_at: null }).eq("id", body.proposalId);
      return failed(filled);
    }
    resolved = filled;
  }

  // Picking from "Where does this go?" means the model wasn't confident: log it for tuning.
  if (_option && message_id) await db.from("message_log").update({ corrected: true }).eq("id", message_id);

  const cards = await commitCard(name, resolved, { db }, proposer(db, message_id));
  return NextResponse.json({ cards });
}
