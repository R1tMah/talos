"use client";

// Behavioral mocks v2, client side: loading mocks, their questions, the prompts and the trends,
// and the writes (all through database functions; every one but the stopwatch's is undoable).
// No model is called, and nothing here logs text: errors carry table names only.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "@/lib/database.types";
import { logicalToday } from "@/lib/date";
import { announceWrite, dataChanged, useDataChanged } from "@/lib/undo";
import { isArea, type BmArea } from "./areas";
import type { QuestionInput } from "./parse";
import { effectivePrompt, type PromptKey } from "./prompts";

type SessionRow = Database["public"]["Tables"]["bm_sessions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["bm_questions"]["Row"];

export type BmSession = SessionRow;
export interface BmQuestion extends Omit<QuestionRow, "area" | "content_score"> {
  area: BmArea;
  content_score: number | null;
}

const toQuestion = (r: QuestionRow): BmQuestion => ({
  ...r,
  area: isArea(r.area) ? r.area : "other",
  // numeric comes back as a number from PostgREST, but be safe about strings.
  content_score: r.content_score == null ? null : Number(r.content_score),
});

// ---- Reads ---------------------------------------------------------------------------------------------

/** One mock with its live questions in order. `loaded` false until the first read finishes. */
export function useBmSession(id: string | null) {
  const [session, setSession] = useState<BmSession | null>(null);
  const [questions, setQuestions] = useState<BmQuestion[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "failed">("loading");

  const reload = useCallback(async () => {
    if (!id) return;
    const db = createClient();
    const [s, q] = await Promise.all([
      db.from("bm_sessions").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
      db.from("bm_questions").select("*").eq("session_id", id).is("deleted_at", null).order("position"),
    ]);
    if (s.error || q.error) return setState("failed");
    if (!s.data) return setState("missing");
    setSession(s.data);
    setQuestions(q.data.map(toQuestion));
    setState("ok");
  }, [id]);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);

  /** Puts a row a write returned in place, without waiting for a reload. */
  const patchQuestion = useCallback((row: Json | undefined) => {
    const r = row as QuestionRow | undefined;
    if (!r?.id) return;
    setQuestions((qs) => (r.deleted_at ? qs.filter((q) => q.id !== r.id) : qs.map((q) => (q.id === r.id ? toQuestion(r) : q))));
  }, []);
  const patchSession = useCallback((row: Json | undefined) => {
    const r = row as SessionRow | undefined;
    if (r?.id) setSession(r);
  }, []);

  return { session, questions, state, reload, patchQuestion, patchSession };
}

export type BmOverviewRow = Database["public"]["Functions"]["bm_sessions_overview"]["Returns"][number];

/** Every live mock, newest first, with its overall score. */
export function useBmOverview() {
  const [rows, setRows] = useState<BmOverviewRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    const res = await createClient().rpc("bm_sessions_overview");
    if (res.error) return setFailed(true);
    setFailed(false);
    setRows(res.data.map((r) => ({ ...r, overall: r.overall == null ? null : Number(r.overall) })));
  }, []);
  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

export type AreaTrend = Database["public"]["Functions"]["bm_trends_by_area"]["Returns"][number];
export type OverallTrend = Database["public"]["Functions"]["bm_trends_overall"]["Returns"][number];

const num = (v: number | null) => (v == null ? null : Number(v));

/** The trends: by area, and across all mocks. */
export function useBmTrends() {
  const [data, setData] = useState<{ areas: AreaTrend[]; overall: OverallTrend | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    const db = createClient();
    const [a, o] = await Promise.all([db.rpc("bm_trends_by_area"), db.rpc("bm_trends_overall")]);
    if (a.error || o.error) return setFailed(true);
    setFailed(false);
    const ov = o.data[0];
    setData({
      areas: a.data.map((r) => ({ ...r, avg_content: num(r.avg_content), avg_final: num(r.avg_final), avg_time_ratio: num(r.avg_time_ratio), avg_retries: num(r.avg_retries) })),
      overall: ov ? { ...ov, avg_time_ratio: num(ov.avg_time_ratio), avg_retries_per_mock: num(ov.avg_retries_per_mock) } : null,
    });
  }, []);
  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, failed, reload };
}

/** The three prompts as stored (null: the default) and as used. */
export function useBmPrompts() {
  const [stored, setStored] = useState<Record<PromptKey, string | null> | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    const res = await createClient().from("settings").select("bm_prompt_questions, bm_prompt_interviewer, bm_prompt_grader").eq("id", 1).maybeSingle();
    if (res.error) return setFailed(true);
    setFailed(false);
    setStored({
      questions: res.data?.bm_prompt_questions ?? null,
      interviewer: res.data?.bm_prompt_interviewer ?? null,
      grader: res.data?.bm_prompt_grader ?? null,
    });
  }, []);
  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  const text = (k: PromptKey) => effectivePrompt(k, stored?.[k]);
  return { stored, failed, reload, text };
}

export interface AppForMock {
  id: string;
  company: string;
  position: string;
  job_description: string | null;
}

/** The application a mock starts from, or null when it's gone. */
export async function loadApplication(id: string): Promise<AppForMock | null | "failed"> {
  const res = await createClient().from("applications").select("id, company, position, job_description").eq("id", id).is("deleted_at", null).maybeSingle();
  if (res.error) return "failed";
  return res.data;
}

// ---- Writes -------------------------------------------------------------------------------------------------

export type BmResult =
  | { status: "saved" | "unchanged"; row?: Json; out: Record<string, Json | undefined> }
  | { status: "invalid"; detail: string }
  | { status: "not_found" | "failed" };

function result(table: string, res: { data: Json | null; error: unknown }, announce = true): BmResult {
  const out = res.data as Record<string, Json | undefined> | null;
  if (res.error || !out || typeof out !== "object") return { status: "failed" };
  const status = out.status;
  if (status === "invalid") return { status: "invalid", detail: String(out.detail ?? "Invalid") };
  if (status === "not_found") return { status: "not_found" };
  if (status === "saved" || status === "unchanged" || status === "started" || status === "stopped" || status === "running" || status === "not_running") {
    if (announce) announceWrite(table, out as { row?: Json; action_id?: string | null });
    return { status: status === "unchanged" ? "unchanged" : "saved", row: out.row, out };
  }
  return { status: "failed" };
}

export interface NewSession {
  applicationId: string | null;
  role: string;
  company: string;
  jobDescription: string;
  saveToApplication: boolean;
}

type QuestionChanges = Partial<Pick<BmQuestion, "area" | "question_text" | "rubric_text" | "target_seconds" | "actual_seconds" | "retries" | "content_score" | "note">>;
type SessionChanges = Partial<Pick<BmSession, "role" | "company" | "job_description" | "feedback_text">>;

export const bmApi = {
  start: async (s: NewSession) => {
    const r = result("bm_sessions", await createClient().rpc("start_bm_session", {
      p_application_id: s.applicationId,
      p_role: s.role,
      p_company: s.company || null,
      p_job_description: s.jobDescription || null,
      p_save_to_application: s.saveToApplication,
      p_started_on: logicalToday(),
    }), false);
    if (r.status === "saved") dataChanged(); // the application's job description, the hub card
    return r;
  },
  /** Saving the questions makes one actions row per question, so it shows no single Undo. */
  saveQuestions: async (sessionId: string, questions: QuestionInput[], raw: string) =>
    result("bm_sessions", await createClient().rpc("save_bm_questions", {
      p_session: sessionId, p_questions: questions as unknown as Json, p_questions_raw: raw || null,
    }), false),
  updateSession: async (id: string, changes: SessionChanges) =>
    result("bm_sessions", await createClient().rpc("update_bm_session", { p_id: id, p_changes: changes as Json })),
  updateQuestion: async (id: string, changes: QuestionChanges) =>
    result("bm_questions", await createClient().rpc("update_bm_question", { p_id: id, p_changes: changes as Json })),
  deleteSession: async (id: string) => result("bm_sessions", await createClient().rpc("delete_bm_session", { p_id: id })),
  deleteQuestion: async (id: string) => result("bm_questions", await createClient().rpc("delete_bm_question", { p_id: id })),
  // The stopwatch: no actions rows, so no Undo toast.
  startTimer: async (id: string) => result("bm_questions", await createClient().rpc("start_bm_timer", { p_id: id }), false),
  stopTimer: async (id: string) => result("bm_questions", await createClient().rpc("stop_bm_timer", { p_id: id }), false),
  retry: async (id: string) => result("bm_questions", await createClient().rpc("retry_bm_question", { p_id: id }), false),
  /** Null or blank resets the prompt to its default. */
  setPrompt: async (which: PromptKey, text: string | null) => {
    const r = result("settings", await createClient().rpc("set_bm_prompt", { p_which: which, p_text: text }), false);
    if (r.status === "saved") dataChanged();
    return r;
  },
  setApplicationJobDescription: async (id: string, text: string) =>
    result("applications", await createClient().rpc("set_application_job_description", { p_id: id, p_text: text })),
};

/** The database clock minus this device's, from a stopwatch call's `now`; 0 when unknown. */
export function skewFrom(out: Record<string, Json | undefined> | undefined, sentAt: number, receivedAt: number): number {
  const now = typeof out?.now === "string" ? Date.parse(out.now) : NaN;
  return Number.isFinite(now) ? now - (sentAt + receivedAt) / 2 : 0;
}
