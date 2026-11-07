"use client";

// The owner's EOD questions (Settings > End of day), read and edited as the owner (RLS).

import { createClient } from "@/utils/supabase/client";
import { isEodTarget, type EodQuestion, type EodTarget } from "./eod";

/** Every question in order, on or off. Null when the read fails. */
export async function loadEodQuestions(): Promise<EodQuestion[] | null> {
  const { data, error } = await createClient().from("eod_questions").select("id, position, prompt, target, enabled")
    .order("position").order("created_at");
  if (error) return null;
  return data.filter((q) => isEodTarget(q.target)).map((q) => ({ ...q, target: q.target as EodTarget }));
}

export const eodApi = {
  async add(position: number, prompt: string, target: EodTarget) {
    const { data, error } = await createClient().from("eod_questions").insert({ position, prompt, target }).select("id").single();
    return error ? null : data.id;
  },
  async update(id: string, change: Partial<Pick<EodQuestion, "prompt" | "target" | "enabled" | "position">>) {
    const { error } = await createClient().from("eod_questions").update(change).eq("id", id);
    return !error;
  },
  async remove(id: string) {
    const { error } = await createClient().from("eod_questions").delete().eq("id", id);
    return !error;
  },
  /** Saves the order as shown: position = index. */
  async reorder(ids: string[]) {
    const db = createClient();
    const results = await Promise.all(ids.map((id, position) => db.from("eod_questions").update({ position }).eq("id", id)));
    return results.every((r) => !r.error);
  },
};
