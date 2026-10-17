// Shared setup for the agent API routes: the owner's session, settings, saved meals
// and the proposal store. Runs as the logged-in owner, so RLS applies to everything.

import { cookies } from "next/headers";
import { logicalDateIn } from "@/lib/date";
import { createClient } from "@/utils/supabase/server";
import type { Propose } from "./run";
import type { Ctx, Db, Resolved } from "./tools";

/** The owner's Supabase client, or null when the request isn't from the owner's session. */
export async function ownerDb(): Promise<Db | null> {
  const db = createClient(await cookies());
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) return null;
  const { data: owner } = await db.rpc("is_owner");
  return owner ? db : null;
}

export async function loadCtx(db: Db, text: string): Promise<{ ctx: Ctx; threshold: number } | null> {
  const [settings, meals, foods, items] = await Promise.all([
    db.from("settings").select("timezone, confidence_threshold, archived_tabs").eq("id", 1).single(),
    db.from("saved_meals").select("id, name, aliases, portion_unit").is("deleted_at", null).order("name"),
    db.from("foods").select("id, name, aliases, serving_unit").is("deleted_at", null).order("name"),
    db.from("saved_meal_items").select("saved_meal_id, food_id, servings").is("deleted_at", null).order("created_at"),
  ]);
  if (settings.error || meals.error || foods.error || items.error) return null;
  return {
    threshold: Number(settings.data.confidence_threshold),
    ctx: {
      db,
      text,
      today: logicalDateIn(settings.data.timezone),
      meals: meals.data.map((m) => ({
        id: m.id, name: m.name, aliases: m.aliases, unit: m.portion_unit,
        items: items.data.filter((i) => i.saved_meal_id === m.id).map((i) => ({ foodId: i.food_id, servings: Number(i.servings) })),
      })),
      foods: foods.data.map((f) => ({ id: f.id, name: f.name, aliases: f.aliases, unit: f.serving_unit })),
      archived: new Set(settings.data.archived_tabs),
    },
  };
}

/** Proposals for one message. `option` marks a "pick one" reading, used to track corrections. */
export function proposer(db: Db, messageId: string | null): Propose {
  return async (tool: string, resolved: Resolved, option = false) => {
    const { data, error } = await db
      .from("pending_proposals")
      .insert({ tool, args: { ...resolved, _option: option }, message_id: messageId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  };
}
