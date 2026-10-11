/** Session actions shared by the Workout tab and Chat. */
import { live } from "./stats";
import type { Card, DB, LoggedSet, Plan } from "./types";

export function startSession(db: DB, plan: Plan): DB {
  return { ...db, session: { plan: plan.name, startedAt: Date.now(), sets: [], restEndsAt: null, current: plan.exercises[0] ?? "" } };
}

/** Appends a set and starts the rest countdown. */
export function logSet(db: DB, set: Omit<LoggedSet, "at">): DB {
  if (!db.session) return db;
  const at = Date.now();
  return {
    ...db,
    session: {
      ...db.session,
      current: set.exercise,
      sets: [...db.session.sets, { ...set, at }],
      restEndsAt: at + db.settings.restSec * 1000,
    },
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "start push", "start legs" → the matching plan, if exactly one matches. */
export function matchStart(text: string, db: DB): Plan | null {
  const m = text.trim().match(/^start\s+(?:workout\s+)?(.+)$/i);
  if (!m || db.session) return null;
  const q = norm(m[1]);
  const hits = live(db.plans).filter((p) => norm(p.name).startsWith(q) || norm(p.name).includes(q));
  return hits.length === 1 ? hits[0] : null;
}

// "135x8", "135 x 8", "135 for 8", "bw x 12", optionally prefixed with an exercise: "ohp 95x6"
const SET_RE = /^(?:(.+?)\s+)?(\d+(?:\.\d+)?|bw)\s*(?:x|×|for)\s*(\d+)\s*(?:reps?)?$/i;

/**
 * While a workout is active, set messages typed in Chat log to it.
 * Returns null when the text is not a set, so normal interpretation runs.
 */
export function routeWorkoutChat(raw: string, db: DB): { db: DB; card: Card } | null {
  const session = db.session;
  if (!session) return null;
  const text = db.settings.aliases.reduce(
    (t, a) => t.replace(new RegExp(`\\b${a.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), a.to),
    raw.trim(),
  );
  const m = text.match(SET_RE);
  if (!m) return null;

  let exercise = session.current;
  if (m[1]) {
    const exercises = db.plans.find((p) => p.name === session.plan)?.exercises ?? [];
    const q = norm(m[1]);
    const hit = exercises.find((e) => norm(e) === q) ?? exercises.find((e) => norm(e).startsWith(q) || norm(e).includes(q));
    if (!hit) return { db, card: { kind: "failed" } };
    exercise = hit;
  }

  const weight = m[2].toLowerCase() === "bw" ? 0 : Number(m[2]);
  const reps = Number(m[3]);
  return {
    db: logSet(db, { exercise, weight, reps }),
    card: { kind: "saved", label: `${exercise} ${weight || "BW"}×${reps}` },
  };
}
