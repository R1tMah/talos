import { fmtDay, fmtNum } from "./date";
import type {
  AnyItem, Application, Callback, Coll, DB, FoodEntry, LeetEntry, Note, Pending, Settings, WeightEntry,
} from "./types";

type Row = AnyItem & Record<string, unknown>;

export function labelFor(coll: Coll, item: AnyItem): string {
  switch (coll) {
    case "weight": {
      const w = item as WeightEntry;
      return `Weight ${w.lb.toFixed(1)} lb, ${fmtDay(w.date)}`;
    }
    case "food": {
      const f = item as FoodEntry;
      return `${f.name}, ${fmtNum(f.cal)} kcal, ${f.p} g protein`;
    }
    case "leetcode": {
      const l = item as LeetEntry;
      return `LeetCode ${l.problem}, ${l.difficulty}, ${l.result}`;
    }
    case "applications": {
      const a = item as Application;
      return `Application ${a.company}, ${a.role}`;
    }
    case "callbacks": {
      const c = item as Callback;
      return `Callback ${c.company}, ${c.type}`;
    }
    case "journal":
      return `Work Journal, ${fmtDay((item as Note).date)}`;
    case "content":
      return `Content, ${fmtDay((item as Note).date)}`;
    case "notes":
      return `Note, ${fmtDay((item as Note).date)}`;
    default:
      return "Saved";
  }
}

export const SETTING_LABELS: Record<keyof Settings, string> = {
  calories: "Calorie target",
  protein: "Protein target",
  carbs: "Carb target",
  fat: "Fat target",
  restSec: "Rest time",
  aliases: "Aliases",
  statuses: "Statuses",
  context: "Context blurb",
};

/** Applies a write and returns the inverse so the result can be undone. */
export function applyPending(db: DB, p: Pending): { db: DB; label: string; undo?: Pending } {
  if (p.op === "settings") {
    const old: Partial<Settings> = {};
    for (const k of Object.keys(p.patch) as (keyof Settings)[]) (old as Record<string, unknown>)[k] = db.settings[k];
    const keys = Object.keys(p.patch) as (keyof Settings)[];
    const label =
      keys.length === 1 && typeof p.patch[keys[0]] === "number"
        ? `${SETTING_LABELS[keys[0]]} ${old[keys[0]]} to ${p.patch[keys[0]]}`
        : "Settings updated";
    return { db: { ...db, settings: { ...db.settings, ...p.patch } }, label, undo: { op: "settings", patch: old } };
  }

  const list = db[p.coll] as Row[];
  const set = (rows: Row[]) => ({ ...db, [p.coll]: rows }) as DB;

  switch (p.op) {
    case "add":
      return { db: set([...list, p.item as Row]), label: labelFor(p.coll, p.item), undo: { op: "purge", coll: p.coll, id: p.item.id } };
    case "purge":
      return { db: set(list.filter((x) => x.id !== p.id)), label: "Removed" };
    case "remove": {
      const row = list.find((x) => x.id === p.id);
      if (!row) throw new Error("missing");
      return {
        db: set(list.map((x) => (x.id === p.id ? { ...x, deleted: true } : x))),
        label: `Deleted ${labelFor(p.coll, row)}`,
        undo: { op: "update", coll: p.coll, id: p.id, patch: { deleted: false } },
      };
    }
    case "update": {
      const row = list.find((x) => x.id === p.id);
      if (!row) throw new Error("missing");
      const old: Record<string, unknown> = {};
      for (const k of Object.keys(p.patch)) old[k] = row[k];
      const next = { ...row, ...p.patch } as Row;
      return {
        db: set(list.map((x) => (x.id === p.id ? next : x))),
        label: `Updated ${labelFor(p.coll, next)}`,
        undo: { op: "update", coll: p.coll, id: p.id, patch: old },
      };
    }
  }
}
