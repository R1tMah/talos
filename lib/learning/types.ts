// Learning shapes shared by the server routes and the screens. Pure.

export type CurriculumStatus = "generating" | "active" | "done" | "failed";

export interface Curriculum {
  id: string;
  createdAt: string;
  topic: string;
  context: string;
  cadence: number[];
  title: string | null;
  goal: string | null;
  status: CurriculumStatus;
  error: string | null;
  /** Optional "finish by" date. */
  targetDate: string | null;
}

export interface LearningModule {
  id: string;
  curriculumId: string;
  position: number;
  title: string;
  objective: string;
  bullets: string[];
  diagram: string;
  diagramCaption: string | null;
  openingQuestion: string;
  scheduledDate: string | null;
  completedAt: string | null;
  completedBy: "tutor" | "manual" | null;
  replacedAt: string | null;
}

export interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** One module as the Architect writes it (before it has an id or date). */
export interface ModuleDraft {
  title: string;
  objective: string;
  bullets: string[];
  diagram: string;
  diagram_caption: string;
  opening_question: string;
}

/**
 * The Tutor route streams newline-delimited JSON events:
 *   text      a piece of the Tutor's reply
 *   complete  the Tutor marked the module complete (the reply may continue after it)
 *   error     the turn failed; `message` is safe to show
 *   done      the turn ended
 */
export type TutorEvent =
  | { type: "text"; text: string }
  | { type: "complete" }
  | { type: "error"; message: string }
  | { type: "done" };

type Row = Record<string, unknown>;

export const toCurriculum = (r: Row): Curriculum => ({
  id: String(r.id), createdAt: String(r.created_at), topic: String(r.topic), context: String(r.context ?? ""),
  cadence: (r.cadence as number[]) ?? [], title: (r.title as string | null) ?? null, goal: (r.goal as string | null) ?? null,
  status: r.status as CurriculumStatus, error: (r.error as string | null) ?? null,
  targetDate: (r.target_date as string | null) ?? null,
});

export const toModule = (r: Row): LearningModule => ({
  id: String(r.id), curriculumId: String(r.curriculum_id), position: Number(r.position), title: String(r.title),
  objective: String(r.objective), bullets: (r.bullets as string[]) ?? [], diagram: String(r.diagram),
  diagramCaption: (r.diagram_caption as string | null) ?? null, openingQuestion: String(r.opening_question),
  scheduledDate: (r.scheduled_date as string | null) ?? null, completedAt: (r.completed_at as string | null) ?? null,
  completedBy: (r.completed_by as "tutor" | "manual" | null) ?? null, replacedAt: (r.replaced_at as string | null) ?? null,
});
