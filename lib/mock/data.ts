"use client";

// Behavioral mocks, client side: past mocks with their questions and graded answers, the
// calls to the two server routes, and the model picks in Settings.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { DEFAULT_MODELS, isMockModel, type Graded, type MockModel, type Rubric } from "./score";
import { useDataChanged } from "@/lib/undo";

export interface MockQuestion {
  id: string;
  position: number; // 1-based, its place in the mock
  area: string;
  question: string;
  target: number;
  rubric: Rubric;
}

export interface MockAnswer {
  id: string;
  created: string;
  transcription: string;
  duration: number;
  target: number;
  penalty: number;
  final: number;
  graded: Graded;
}

export interface MockSession {
  id: string;
  created: string;
  company: string;
  role: string;
  includeFit: boolean;
  pdfName: string | null;
  questions: (MockQuestion & { answers: MockAnswer[] })[];
}

const asRubric = (v: unknown): Rubric => {
  const o = (v ?? {}) as Partial<Rubric>;
  return { requirements: o.requirements ?? [], strong_signals: o.strong_signals ?? [], red_flags: o.red_flags ?? [] };
};

/** Every mock, newest first, with its questions in order and their graded answers (each try, oldest first). */
export function useMockHistory() {
  const [rows, setRows] = useState<MockSession[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("mock_sessions")
      .select("id, created_at, company, role, include_fit, pdf_name, mock_questions(id, position, area, question, rubric, target_time_seconds, mock_answers(*))")
      .is("deleted_at", null).order("created_at", { ascending: false });
    if (res.error) return setFailed(true);
    setFailed(false);
    setRows(res.data.map((s) => ({
      id: s.id, created: s.created_at, company: s.company, role: s.role, includeFit: s.include_fit, pdfName: s.pdf_name,
      questions: [...s.mock_questions].sort((a, b) => a.position - b.position).map((q) => ({
        id: q.id, position: q.position, area: q.area, question: q.question, target: q.target_time_seconds, rubric: asRubric(q.rubric),
        answers: [...q.mock_answers].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((a) => {
          const f = (a.feedback ?? {}) as Partial<{ checks: Graded["checks"]; worked: string; failed: string; tip: string }>;
          return {
            id: a.id, created: a.created_at, transcription: a.transcription, duration: a.duration_seconds, target: a.target_time_seconds,
            penalty: a.yap_penalty, final: a.final_score,
            graded: { content: a.content_score, checks: f.checks ?? [], worked: f.worked ?? "", failed: f.failed ?? "", tip: f.tip ?? "" },
          };
        }),
      })),
    })));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

/** A question's latest graded try, if any. */
export const lastAnswer = (q: { answers: MockAnswer[] }) => q.answers.at(-1) ?? null;

type Out<T> = { ok: true; value: T } | { ok: false; error: string };

async function post<T>(path: string, body: object): Promise<Out<T>> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "Couldn't reach Talos. Check your connection." };
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  return res.ok ? { ok: true, value: out } : { ok: false, error: out.error ?? "Failed" };
}

export interface PdfFile { name: string; data: string } // data: base64, no prefix

export interface NewMock { company: string; role: string; includeFit: boolean; context: string; pdf: PdfFile | null }

export const mockApi = {
  /** A new mock: the Architect writes all of its questions at once. */
  start: (m: NewMock) => post<{ sessionId: string }>("/api/mock/start", m),
  grade: (questionId: string, transcription: string, durationSeconds: number) =>
    post<{ answer: MockAnswer }>("/api/mock/grade", { questionId, transcription, durationSeconds }),
  remove: async (sessionId: string) => {
    const { error } = await createClient().from("mock_sessions").update({ deleted_at: new Date().toISOString() }).eq("id", sessionId);
    return !error;
  },
};

/** Reads a picked file as base64 (no data: prefix). */
export function readPdf(file: File): Promise<PdfFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, data: String(r.result).split(",")[1] ?? "" });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---- Settings: which model plays each role ----------------------------------------------

export function useMockModels() {
  const [models, setModels] = useState<{ architect: MockModel; grader: MockModel } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    createClient().from("mock_settings").select("architect_model, grader_model").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) return setFailed(true);
      setModels({
        architect: isMockModel(data?.architect_model) ? data.architect_model : DEFAULT_MODELS.architect,
        grader: isMockModel(data?.grader_model) ? data.grader_model : DEFAULT_MODELS.grader,
      });
    });
  }, []);

  const save = async (next: { architect: MockModel; grader: MockModel }) => {
    const before = models;
    setModels(next);
    const { error } = await createClient().from("mock_settings")
      .update({ architect_model: next.architect, grader_model: next.grader, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) {
      setModels(before);
      setFailed(true);
    }
  };

  return { models, failed, save };
}
