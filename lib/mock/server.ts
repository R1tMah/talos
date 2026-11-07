// Behavioral mocks, server side: the owner's model picks and the daily caps. Runs as the
// signed-in owner (RLS applies).

import type { Db } from "@/lib/agent/tools";
import { DEFAULT_MODELS, isMockModel, type MockModel } from "./score";

/** Mocks the Architect may write per rolling 24 hours (one call each), and answers the Grader may grade. */
export const MOCKS_PER_DAY = 6;
export const GRADES_PER_DAY = 60;

export async function mockModels(db: Db): Promise<{ architect: MockModel; grader: MockModel }> {
  const { data } = await db.from("mock_settings").select("architect_model, grader_model").eq("id", 1).maybeSingle();
  return {
    architect: isMockModel(data?.architect_model) ? data.architect_model : DEFAULT_MODELS.architect,
    grader: isMockModel(data?.grader_model) ? data.grader_model : DEFAULT_MODELS.grader,
  };
}

const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

export async function mocksCapped(db: Db) {
  const { count } = await db.from("mock_sessions").select("id", { count: "exact", head: true }).gte("created_at", dayAgo());
  return (count ?? 0) >= MOCKS_PER_DAY;
}

export async function gradesCapped(db: Db) {
  const { count } = await db.from("mock_answers").select("id", { count: "exact", head: true }).gte("created_at", dayAgo());
  return (count ?? 0) >= GRADES_PER_DAY;
}
