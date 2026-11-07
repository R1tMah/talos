import Anthropic from "@anthropic-ai/sdk";
import { ownerDb } from "@/lib/agent/server";
import { logUsage, reschedule, tutorCapped, TUTOR_PER_HOUR } from "@/lib/learning/server";
import { ALREADY_COMPLETE, COMPLETE_TOOL, TUTOR_MODEL, tutorSystem } from "@/lib/learning/tutor";
import { toCurriculum, toModule, type TutorEvent } from "@/lib/learning/types";

export const maxDuration = 60;

const MAX_LENGTH = 2000;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ type: "error", message } satisfies TutorEvent) + "\n", { status, headers: { "Content-Type": "application/x-ndjson" } });

/**
 * One learner message in, the Tutor's reply streamed out as newline-delimited TutorEvents.
 * Both sides of the exchange are saved to module_messages; the Tutor's
 * mark_module_complete call finishes the module and moves the schedule.
 */
export async function POST(req: Request) {
  const db = await ownerDb();
  if (!db) return json(401, "Not signed in.");

  let body: { moduleId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, "Bad request.");
  }
  const moduleId = typeof body.moduleId === "string" ? body.moduleId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!moduleId || !text || text.length > MAX_LENGTH) return json(400, "Write a message (up to 2,000 characters).");
  if (await tutorCapped(db)) return json(429, `That's ${TUTOR_PER_HOUR} messages in the last hour. Take a break and come back.`);

  const modRow = await db.from("curriculum_modules").select("*").eq("id", moduleId).maybeSingle();
  if (!modRow.data || modRow.data.replaced_at) return json(404, "This module was replaced or doesn't exist.");
  const mod = toModule(modRow.data);
  const [curRow, earlier, history] = await Promise.all([
    db.from("curriculums").select("*").eq("id", mod.curriculumId).single(),
    db.from("curriculum_modules").select("title").eq("curriculum_id", mod.curriculumId).is("replaced_at", null).lt("position", mod.position).order("position"),
    db.from("module_messages").select("role, content").eq("module_id", moduleId).order("created_at"),
  ]);
  if (curRow.error || earlier.error || history.error) return json(500, "Couldn't load the lesson.");
  const cur = toCurriculum(curRow.data);

  const saved = await db.from("module_messages").insert({ module_id: moduleId, role: "user", content: text });
  if (saved.error) return json(500, "Couldn't save your message.");

  const system: Anthropic.TextBlockParam[] = [{
    type: "text",
    text: tutorSystem({ curriculumTitle: cur.title ?? cur.topic, goal: cur.goal ?? "", learnerContext: cur.context, earlierTitles: earlier.data.map((e) => e.title), module: mod }),
    cache_control: { type: "ephemeral" },
  }];
  // The opening question is the Tutor's first turn; the API needs a user turn before it.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "(The lesson opened.)" },
    { role: "assistant", content: mod.openingQuestion },
    ...history.data.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: text },
  ];
  const wasComplete = !!mod.completedAt;
  // After the cached block, so the module prompt still caches.
  if (wasComplete) system.push({ type: "text", text: ALREADY_COMPLETE });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TutorEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      let reply = "";
      try {
        // At most two rounds: a reply that calls the tool, then the words after it.
        for (let round = 0; round < 2; round++) {
          const s = anthropic().messages.stream({
            model: TUTOR_MODEL,
            max_tokens: 8000,
            output_config: { effort: "low" },
            system,
            messages,
            ...(wasComplete ? {} : { tools: [COMPLETE_TOOL] }),
          });
          s.on("text", (delta) => {
            reply += delta;
            send({ type: "text", text: delta });
          });
          let message: Anthropic.Message;
          try {
            message = await s.finalMessage();
          } catch (e) {
            if (e instanceof Anthropic.APIError) throw e;
            break; // the tool input couldn't be parsed: end the turn with what was said
          }
          await logUsage(db, message);
          if (message.stop_reason === "refusal") break;
          const call = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === COMPLETE_TOOL.name);
          if (!call || message.stop_reason !== "tool_use") break;

          const evidence = (call.input as { evidence?: unknown })?.evidence;
          let result = "Marked complete.";
          if (typeof evidence !== "string" || !evidence.trim()) {
            result = "Not marked: evidence is required.";
          } else {
            const done = await db.from("curriculum_modules").update({ completed_at: new Date().toISOString(), completed_by: "tutor" })
              .eq("id", moduleId).is("completed_at", null);
            if (done.error) result = "Couldn't save that; the module isn't marked yet.";
            else {
              await reschedule(db, mod.curriculumId);
              send({ type: "complete" });
            }
          }
          if (reply && !reply.endsWith("\n")) {
            reply += "\n\n";
            send({ type: "text", text: "\n\n" });
          }
          messages.push({ role: "assistant", content: message.content });
          messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: result }] });
        }
        if (reply.trim()) await db.from("module_messages").insert({ module_id: moduleId, role: "assistant", content: reply.trim() });
        send({ type: "done" });
      } catch (e) {
        if (reply.trim()) await db.from("module_messages").insert({ module_id: moduleId, role: "assistant", content: reply.trim() });
        send({ type: "error", message: e instanceof Anthropic.RateLimitError ? "The tutor is busy. Try again in a moment." : "The tutor couldn't answer. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
