"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Json } from "./database.types";
import { isExperienceCategory, type Experience, type ExperienceCategory } from "./experiences";
import { announceWrite, useDataChanged } from "./undo";

export type WriteResult = { status: "saved"; id?: string } | { status: "conflict"; title: string } | { status: "not_found" } | { status: "failed" };

const toExperience = (r: Record<string, unknown>): Experience => ({
  id: String(r.id),
  title: String(r.title),
  category: isExperienceCategory(r.category) ? r.category : "Books",
  recommendedBy: (r.recommended_by as string | null) ?? null,
  status: r.status === "completed" ? "completed" : "pending",
  createdAt: String(r.created_at),
  completedAt: (r.completed_at as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  rating: r.rating == null ? null : Number(r.rating),
});

/** Every live item: pending newest first, completed by when they were done (newest first). Reloads after any write or undo. */
export function useExperiences() {
  const [rows, setRows] = useState<Experience[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await createClient().from("life_experiences").select("*").is("deleted_at", null)
      .order("completed_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false });
    if (res.error) return setFailed(true);
    setFailed(false);
    setRows(res.data.map(toExperience));
  }, []);

  useDataChanged(reload);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, failed, reload };
}

function parse(res: { data: Json | null; error: unknown }): WriteResult {
  const out = res.data as { status?: string; existing?: { title?: string }; row?: { id?: string } } | null;
  if (res.error || !out) return { status: "failed" };
  announceWrite("life_experiences", out as { row?: Json; action_id?: string | null });
  if (out.status === "conflict") return { status: "conflict", title: out.existing?.title ?? "" };
  if (out.status === "saved") return { status: "saved", id: out.row?.id };
  return out.status === "not_found" ? { status: "not_found" } : { status: "failed" };
}

export interface ExperienceInput {
  title: string;
  category: ExperienceCategory;
  recommendedBy: string | null;
  completed: boolean;
  note: string | null;
  rating: number | null;
}

// Generated arg types mark optional args as non-null; null is what we mean by "none".
const opt = <T,>(v: T | null) => v as T;

/** Writes go through the database functions, which log an actions row (so Undo works). */
export const experiencesApi = {
  add: async (e: ExperienceInput) =>
    parse(await createClient().rpc("add_experience", {
      p_title: e.title, p_category: e.category, p_recommended_by: opt(e.recommendedBy), p_completed: e.completed,
      p_note: opt(e.note), p_rating: opt(e.rating),
    })),
  complete: async (id: string, note: string | null, rating: number | null) =>
    parse(await createClient().rpc("complete_experience", { p_id: id, p_note: opt(note), p_rating: opt(rating) })),
  update: async (id: string, e: Omit<ExperienceInput, "completed">) =>
    parse(await createClient().rpc("update_experience", {
      p_id: id, p_title: e.title, p_category: e.category, p_recommended_by: opt(e.recommendedBy), p_note: opt(e.note), p_rating: opt(e.rating),
    })),
  remove: async (id: string) => parse(await createClient().rpc("delete_experience", { p_id: id })),
};
