/**
 * Stand-in for the model: maps an utterance to a typed card or a write.
 * Rule-based so every card state can be exercised without a backend.
 */
import { SETTING_LABELS, labelFor } from "./apply";
import { addDays, fmtDay, fmtNum, newestFirst, nowHM, todayISO, uid, weekStart } from "./date";
import { countBy, dayTotals, inWeek, live, weekSummary } from "./stats";
import type {
  Application, Callback, Coll, DB, Difficulty, FoodEntry, Interpretation, LcResult, LeetEntry, Note, Option, Settings,
  WeightEntry,
} from "./types";

const WEIGHT_RE = /^(?:weight|wt|w|weighed)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds)?\s*[,.-]?\s*(.*)$/i;

function expandAliases(text: string, db: DB) {
  return db.settings.aliases.reduce(
    (t, a) => t.replace(new RegExp(`\\b${a.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), a.to),
    text,
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stamp = () => ({ id: uid(), date: todayISO(), time: nowHM() });

function note(text: string): Note {
  return { ...stamp(), text };
}

export function interpret(raw: string, db: DB): Interpretation {
  const text = expandAliases(raw.trim(), db);
  const t = text.toLowerCase();
  const today = todayISO();

  // Queries
  if (/\?$|^(how|what|show|avg|average|total)\b/.test(t)) {
    const weights = live(db.weight);
    if (/weight|avg|average/.test(t) && !/protein|cal/.test(t)) {
      const last = /last week/.test(t);
      const s = weekSummary(weights, last ? addDays(weekStart(today), -7) : weekStart(today));
      return {
        kind: "query",
        title: `${last ? "Last" : "This"} week average, ${s.days} days`,
        value: s.avg == null ? "–" : s.avg.toFixed(1),
        unit: "lb",
      };
    }
    if (/protein|calorie|cal\b|kcal|macro/.test(t)) {
      const d = dayTotals(live(db.food), today);
      const s = db.settings;
      return {
        kind: "query",
        title: "Today",
        table: {
          cols: ["", "Logged", "Target"],
          rows: [
            ["Calories", fmtNum(d.cal), fmtNum(s.calories)],
            ["Protein", `${d.p} g`, `${s.protein} g`],
            ["Carbs", `${d.c} g`, `${s.carbs} g`],
            ["Fat", `${d.f} g`, `${s.fat} g`],
          ],
        },
      };
    }
    if (/leet|lc|problem/.test(t)) {
      return { kind: "query", title: "LeetCode this week", value: String(inWeek(live(db.leetcode)).length), unit: "problems" };
    }
    if (/app|status/.test(t)) {
      const c = countBy(live(db.applications), (a) => a.status);
      return {
        kind: "query",
        title: "Applications by status",
        table: { cols: ["Status", "Count"], rows: db.settings.statuses.map((s) => [s, String(c[s] ?? 0)]) },
      };
    }
  }

  // Settings
  const target = t.match(/^(?:set\s+)?(calorie|calories|protein|carbs?|fat)\s+target\s+(?:to\s+)?(\d+)/);
  if (target) {
    const key = ({ calorie: "calories", calories: "calories", protein: "protein", carb: "carbs", carbs: "carbs", fat: "fat" } as const)[
      target[1] as "calorie"
    ];
    return settingConfirm(db, key, Number(target[2]));
  }
  const rest = t.match(/^(?:set\s+)?rest(?:\s+time)?\s+(?:to\s+)?(\d+)\s*(s|sec|secs|seconds|m|min|mins|minutes)?$/);
  if (rest) {
    const n = Number(rest[1]);
    return settingConfirm(db, "restSec", rest[2]?.startsWith("m") ? n * 60 : n);
  }

  // Edits and deletes of the latest entry
  const del = t.match(/^(?:delete|remove)\s+last\s+(weight|meal|food|lc|leetcode|app|application|workout)/);
  if (del) {
    const coll = collFromWord(del[1]);
    const row = latest(db, coll);
    if (!row) return { kind: "failed" };
    return {
      kind: "confirm",
      title: "Delete",
      changes: [{ field: "Entry", from: labelFor(coll, row), to: "Deleted" }],
      pending: { op: "remove", coll, id: row.id },
    };
  }
  const edit = t.match(/^(?:change|edit|fix)\s+last\s+weight\s+(?:to\s+)?(\d{2,3}(?:\.\d+)?)/);
  if (edit) {
    const row = latest(db, "weight") as WeightEntry | undefined;
    if (!row) return { kind: "failed" };
    const lb = Number(edit[1]);
    return {
      kind: "confirm",
      title: `Edit weight, ${fmtDay(row.date)}`,
      changes: [{ field: "Weight", from: `${row.lb.toFixed(1)} lb`, to: `${lb.toFixed(1)} lb` }],
      pending: { op: "update", coll: "weight", id: row.id, patch: { lb } },
    };
  }

  // Weight
  const w = text.match(WEIGHT_RE);
  if (w && (/^\d/.test(t) || /^(weight|wt|w|weighed)\b/.test(t)) && !/cal|kcal|protein/.test(t)) {
    const lb = Number(w[1]);
    const entry: WeightEntry = { ...stamp(), lb, note: w[2] ? cap(w[2]) : undefined };
    const prev = latest(db, "weight") as WeightEntry | undefined;
    if (lb < 80 || lb > 500 || (prev && Math.abs(lb - prev.lb) > 4)) {
      const diff = prev ? lb - prev.lb : 0;
      return {
        kind: "warning",
        detail: `Weight ${lb.toFixed(1)} lb${prev ? `, ${diff > 0 ? "+" : ""}${diff.toFixed(1)} from ${prev.lb.toFixed(1)}` : ""}`,
        pending: { op: "add", coll: "weight", item: entry },
        text: raw,
      };
    }
    return { kind: "save", pending: { op: "add", coll: "weight", item: entry } };
  }

  // LeetCode
  const lc = text.match(/^(?:lc|leetcode)\s+(.+)$/i);
  if (lc) return { kind: "save", pending: { op: "add", coll: "leetcode", item: parseLeet(lc[1]) } };

  // Applications
  const app = text.match(/^(?:applied|apply|app)\s+(?:to\s+)?(.+)$/i);
  if (app) {
    const body = app[1];
    const draft: Partial<Application> = {
      company: cap(body.split(/\s+(?:for|via|as)\s+/i)[0].trim()),
      role: body.match(/\b(?:for|as)\s+(.+?)(?=\s+via\s+|$)/i)?.[1],
      source: body.match(/\bvia\s+(.+?)(?=\s+(?:for|as)\s+|$)/i)?.[1],
      status: "Applied",
    };
    const missing = (["role", "source"] as const).filter((k) => !draft[k]).map(cap);
    if (missing.length) return { kind: "missing", tool: "Applications", missing, draft };
    const item: Application = { ...stamp(), company: draft.company!, role: draft.role!, source: cap(draft.source!), status: "Applied" };
    return { kind: "save", pending: { op: "add", coll: "applications", item } };
  }

  // Callbacks
  const cb = text.match(/^(oa|interview|recruiter|callback)\s+(?:from\s+|with\s+|at\s+)?(\S+)(?:\s+(.+))?$/i);
  if (cb) {
    const type = (cb[1].toLowerCase() === "oa" ? "OA" : cb[1].toLowerCase() === "recruiter" ? "Recruiter" : "Interview") as Callback["type"];
    const item: Callback = { ...stamp(), company: cap(cb[2]), type, stage: cb[3] ? cap(cb[3]) : "Scheduled", debrief: "" };
    return { kind: "save", pending: { op: "add", coll: "callbacks", item } };
  }

  // Notepads
  const pad = text.match(/^(journal|work|content|idea|note)\s*[:\-]\s*([\s\S]+)$/i);
  if (pad) {
    const coll: Coll = /journal|work/i.test(pad[1]) ? "journal" : /note/i.test(pad[1]) ? "notes" : "content";
    return { kind: "save", pending: { op: "add", coll, item: note(pad[2]) } };
  }

  // Food
  const cal = t.match(/(\d{2,4})\s*(?:cal|cals|kcal|calories)\b/);
  const meal = live(db.meals).find((m) => t.includes(m.name.toLowerCase()));
  if (meal && !cal) {
    const item: FoodEntry = { ...stamp(), name: meal.name, cal: meal.cal, p: meal.p, c: meal.c, f: meal.f, source: "saved" };
    return { kind: "save", pending: { op: "add", coll: "food", item } };
  }
  if (cal) {
    const grams = (re: RegExp) => Number(t.match(re)?.[1] ?? 0);
    const name =
      text
        .replace(/^(ate|had|eaten)\s+/i, "")
        .replace(/\d+\s*(cal|cals|kcal|calories|g\s*(protein|carbs?|fat)|p|c|f|protein|carbs?|fat)\b/gi, "")
        .replace(/[,\s]+$/g, "")
        .replace(/\s{2,}/g, " ")
        .trim() || "Food";
    const item: FoodEntry = {
      ...stamp(), name: cap(name), cal: Number(cal[1]),
      p: grams(/(\d+)\s*g?\s*(?:p|protein)\b/), c: grams(/(\d+)\s*g?\s*(?:c|carbs?)\b/), f: grams(/(\d+)\s*g?\s*(?:f|fat)\b/),
      source: "typed",
    };
    return { kind: "save", pending: { op: "add", coll: "food", item } };
  }

  return unsure(text);
}

/** Photo with optional caption. Without a vision model, offer the likely destinations. */
export function interpretPhoto(caption: string): Interpretation {
  const est: FoodEntry = { ...stamp(), name: caption ? cap(caption) : "Meal (photo)", cal: 650, p: 40, c: 60, f: 22, source: "estimate" };
  const base = unsure(caption || "Photo");
  if (base.kind !== "unsure") return base;
  return {
    ...base,
    options: [
      { tool: "Nutrition", fields: [["Meal", est.name], ["Calories", "650 est."], ["Protein", "40 g est."]], pending: { op: "add", coll: "food", item: est } },
      ...base.options.slice(0, 2),
    ],
  };
}

function unsure(text: string): Interpretation {
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  const options: Option[] = [
    { tool: "Work Journal", fields: [["Entry", short]], pending: { op: "add", coll: "journal", item: note(text) } },
    { tool: "Content", fields: [["Idea", short]], pending: { op: "add", coll: "content", item: note(text) } },
    {
      tool: "LeetCode",
      fields: [["Problem", short], ["Difficulty", "Medium"], ["Result", "Solved"]],
      pending: { op: "add", coll: "leetcode", item: parseLeet(text) },
    },
  ];
  return { kind: "unsure", options, note: { op: "add", coll: "notes", item: note(text) } };
}

function parseLeet(body: string): LeetEntry {
  const inferred: string[] = [];
  const diff = body.match(/\b(easy|medium|hard)\b/i)?.[1];
  const res = body.match(/\b(solved|hint|failed|fail)\b/i)?.[1];
  const min = body.match(/(\d+)\s*(?:m|min|mins|minutes)\b/i)?.[1];
  if (!diff) inferred.push("difficulty");
  if (!res) inferred.push("result");
  if (!min) inferred.push("minutes");
  const problem = body
    .replace(/\b(easy|medium|hard|solved|hint|failed|fail|redo)\b/gi, "")
    .replace(/\d+\s*(?:m|min|mins|minutes)\b/gi, "")
    .replace(/[,\s]+/g, " ")
    .trim();
  const result = (res ? (res.toLowerCase().startsWith("fail") ? "Failed" : cap(res.toLowerCase())) : "Solved") as LcResult;
  return {
    ...stamp(),
    problem: problem.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled",
    difficulty: (diff ? cap(diff.toLowerCase()) : "Medium") as Difficulty,
    result,
    minutes: min ? Number(min) : 30,
    redo: result !== "Solved" || /\bredo\b/i.test(body),
    inferred: inferred.length ? inferred : undefined,
  };
}

function settingConfirm(db: DB, key: keyof Settings, value: number): Interpretation {
  const unit = key === "restSec" ? " s" : key === "calories" ? " kcal" : " g";
  return {
    kind: "confirm",
    title: "Settings",
    changes: [{ field: SETTING_LABELS[key], from: `${db.settings[key]}${unit}`, to: `${value}${unit}` }],
    pending: { op: "settings", patch: { [key]: value } },
  };
}

function collFromWord(w: string): Coll {
  if (/weight/.test(w)) return "weight";
  if (/meal|food/.test(w)) return "food";
  if (/lc|leet/.test(w)) return "leetcode";
  if (/workout/.test(w)) return "workouts";
  return "applications";
}

function latest(db: DB, coll: Coll) {
  return [...live(db[coll] as { id: string; date: string; time: string; deleted?: boolean }[])].sort(newestFirst)[0] as
    | (WeightEntry & { id: string })
    | undefined;
}
