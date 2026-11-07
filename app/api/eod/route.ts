import { NextResponse } from "next/server";
import type { ChatCard, ChatResponse } from "@/lib/agent/cards";
import { draftFromAnswers, draftFromOneShot, extract, needsModel, spendingText } from "@/lib/agent/eod";
import { ownerDb, proposer } from "@/lib/agent/server";
import { logicalDateIn } from "@/lib/date";
import { isEodTarget, targetLabel, targetTab, type EodAnswer, type EodReminder, type EodTarget } from "@/lib/eod";
import type { Json } from "@/lib/database.types";

const PER_MINUTE = 20; // shared with /api/chat: both count message_log rows
const MAX_LENGTH = 4000;

const failed = (status = 200, detail?: string): NextResponse<ChatResponse> =>
  NextResponse.json({ cards: [{ kind: "failed", ...(detail ? { detail } : {}) }] }, { status });

/**
 * End of day: the interview's answers (or a one-shot "EOD: ..." message) in, one EOD card
 * out. Nothing is written here; the card's Save EOD commits the stored proposal through
 * /api/confirm, every entry in one transaction.
 *
 * Body: { clientMsgId, answers: [{ target, text }] } or { clientMsgId, text }.
 */
export async function POST(req: Request): Promise<NextResponse<ChatResponse>> {
  const db = await ownerDb();
  if (!db) return failed(401);

  let body: { clientMsgId?: unknown; answers?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return failed(400);
  }
  const clientMsgId = typeof body.clientMsgId === "string" ? body.clientMsgId : "";
  const oneShot = typeof body.text === "string" ? body.text.trim() : null;
  const answers: EodAnswer[] | null = Array.isArray(body.answers)
    ? body.answers.filter((a): a is EodAnswer => isEodTarget(a?.target) && typeof a?.text === "string").map((a) => ({ target: a.target, text: a.text }))
    : null;
  // Every question skipped still sends an empty list: the card can be just reminders.
  if (!clientMsgId || (!oneShot && !answers)) return failed(400);
  // What chat history shows for this message.
  const logText = oneShot
    ? `EOD: ${oneShot}`
    : answers!.length ? `EOD\n${answers!.map((a) => `${targetLabel(a.target)}: ${a.text.trim()}`).join("\n")}` : "EOD (all skipped)";
  if (logText.length > MAX_LENGTH) return failed(400);

  // The same message sent twice gets the first answer back, not a second proposal.
  const seen = await db.from("message_log").select("response").eq("client_msg_id", clientMsgId).maybeSingle();
  if (seen.data?.response) return NextResponse.json(seen.data.response as unknown as ChatResponse);
  const recent = await db.from("message_log").select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((recent.count ?? 0) >= PER_MINUTE) return failed(429);

  const logged = await db.from("message_log").insert({ client_msg_id: clientMsgId, text: logText, route: "eod" }).select("id").single();
  if (logged.error) return failed();

  const [settings, questions] = await Promise.all([
    db.from("settings").select("timezone, archived_tabs").eq("id", 1).single(),
    db.from("eod_questions").select("target").eq("enabled", true),
  ]);
  if (settings.error) return failed();
  const archived = new Set(settings.data.archived_tabs);
  const today = logicalDateIn(settings.data.timezone);
  // A one-shot keeps only what the questions ask about (all of it when none are set up).
  const asked = new Set<EodTarget>((questions.data ?? []).map((q) => q.target).filter(isEodTarget));
  const allowed = new Set<EodTarget>(
    (asked.size ? [...asked] : (["journal", "personal", "content", "talos", "spending"] as EodTarget[])).filter((t) => !archived.has(targetTab(t))),
  );

  // Open reminders due today or overdue, to tick off on the card.
  const open = await db.from("reminders").select("id, body, due_date").is("done_at", null).is("deleted_at", null)
    .lte("due_date", today).order("due_date").order("created_at").limit(20);
  const reminders: EodReminder[] = (open.data ?? []).map((r) => ({ id: r.id, body: r.body, due: r.due_date }));

  let cards: ChatCard[];
  try {
    const kept = answers?.filter((a) => !archived.has(targetTab(a.target))) ?? null;
    const draft = oneShot
      ? draftFromOneShot(oneShot, await extract(db, oneShot), allowed)
      : draftFromAnswers(kept!, needsModel(kept!) ? await extract(db, spendingText(kept!)) : null);
    if (!draft.notes.length && !draft.spending.length && !reminders.length) {
      cards = [{ kind: "failed", detail: draft.unclear.length ? draft.unclear.join(" ") : "Nothing to save for today." }];
    } else {
      // The reminders go in the proposal too: Save EOD can only tick ones offered here.
      const proposalId = await proposer(db, logged.data.id)("save_eod", {
        date: today, notes: draft.notes as unknown as Json, spending: draft.spending as unknown as Json,
        reminders: reminders as unknown as Json,
      });
      cards = [{
        kind: "eod", date: today, notes: draft.notes, spending: draft.spending, proposalId,
        ...(reminders.length ? { reminders } : {}), ...(draft.unclear.length ? { unclear: draft.unclear } : {}),
      }];
    }
  } catch {
    cards = [{ kind: "failed" }];
  }

  const response: ChatResponse = { cards };
  await db.from("message_log").update({ response: response as unknown as Json }).eq("id", logged.data.id);
  return NextResponse.json(response);
}
