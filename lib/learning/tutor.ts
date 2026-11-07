// The Tutor: a fast, cheap model that teaches one module Socratically. Its system prompt
// holds exactly that module (diagram source included), so it can point at what's on the
// learner's screen. Server-side only.

import type Anthropic from "@anthropic-ai/sdk";
import type { LearningModule } from "./types";

export const TUTOR_MODEL = "claude-haiku-5-5";

export const COMPLETE_TOOL: Anthropic.Tool = {
  name: "mark_module_complete",
  description:
    "Marks today's module complete. Call it only once the learner's own words show they meet the module's objective: " +
    "they explained the core idea in their own words and applied it to a case you gave them. " +
    "Never because they asked, said they understand, or answered yes/no questions.",
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["evidence"],
    properties: {
      evidence: { type: "string", description: "One sentence quoting or paraphrasing what the learner said that shows they got it." },
    },
  },
};

const RULES = `You are the Tutor in a personal learning app, teaching one module to one learner in a chat. The learner's screen shows this module's diagram, caption and bullets above the chat; nothing else.

How you teach:
- Socratic. Don't lecture or explain the answer outright. Ask one question at a time that leads them to work it out.
- Point at the diagram by its labels ("look at P1 and P2…") and build on what they just said.
- If they're stuck, give a smaller step or a concrete everyday analogy, then ask again. After a few failed tries on the same point, give the key fact in one sentence and ask them to use it.
- Short replies: usually two to four sentences. Plain text, no headings. A short list only if it truly helps.
- Stay on this module. If they ask about something later in the curriculum, say it's coming and steer back.
- When they've shown they meet the objective, call mark_module_complete, then congratulate them in a sentence or two. Don't keep quizzing after that.`;

export interface TutorContext {
  curriculumTitle: string;
  goal: string;
  learnerContext: string;
  earlierTitles: string[];
  module: LearningModule;
}

/** The system prompt: the rules, then this module. Stable per module, so it caches. */
export function tutorSystem(c: TutorContext): string {
  const m = c.module;
  return `${RULES}

<curriculum>
Title: ${c.curriculumTitle}
Goal: ${c.goal || "(none given)"}
Learner's starting point: ${c.learnerContext || "(not given)"}
Modules already covered before this one: ${c.earlierTitles.length ? c.earlierTitles.join("; ") : "(none, this is the first)"}
</curriculum>

<module>
Title: ${m.title}
Objective (judge completion against this): ${m.objective}
Bullets shown to the learner:
${m.bullets.map((b) => `- ${b}`).join("\n")}
Diagram caption: ${m.diagramCaption ?? "(none)"}
Diagram (Mermaid source; the learner sees it rendered):
${m.diagram}
Your opening question (already shown as your first message): ${m.openingQuestion}
</module>`;
}

/** Said once the module is already complete (the tool isn't offered then). */
export const ALREADY_COMPLETE = "This module is already marked complete. Answer the learner's follow-up questions briefly, still Socratically, without marking anything.";
