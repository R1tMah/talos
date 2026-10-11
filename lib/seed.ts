import { addDays, nowHM, todayISO, uid, weekStart } from "./date";
import type { Application, Callback, DB, FoodEntry, LeetEntry, Note, WeightEntry, Workout } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLANS = [
  { id: "plan-a", name: "Push", exercises: ["Bench press", "Overhead press", "Incline DB press", "Dip", "Lateral raise"] },
  { id: "plan-c", name: "Pull", exercises: ["Pull-up", "Barbell row", "Lat pulldown", "Seated cable row", "Curl"] },
  { id: "plan-b", name: "Lower", exercises: ["Back squat", "Romanian deadlift", "Leg press", "Leg curl", "Calf raise"] },
];

/**
 * Older saved data used "Upper A"/"Upper B". Rename them (and the history that
 * refers to them) to Push/Pull. Exercise lists are only replaced if untouched.
 */
const OLD_PLANS: Record<string, { to: string; exercises: string }> = {
  "Upper A": { to: "Push", exercises: "Bench press|Barbell row|Overhead press|Lat pulldown|Lateral raise" },
  "Upper B": { to: "Pull", exercises: "Incline DB press|Pull-up|Seated cable row|Dip|Curl" },
};

/** Data saved before breaks existed gets the collection, plus the example so it shows in dev. */
export function migrateBreaks(db: DB): DB {
  if (Array.isArray(db.breaks)) return db;
  const today = todayISO();
  return { ...db, breaks: [{ id: uid(), start: addDays(today, -38), end: addDays(today, -36), label: "NY Trip where we ate like a fatass" }] };
}

export function migratePlanNames(db: DB): DB {
  if (!db.plans.some((p) => OLD_PLANS[p.name])) return db;
  const rename = (n: string) => OLD_PLANS[n]?.to ?? n;
  const order = (n: string) => ["Push", "Pull"].indexOf(n) + 1 || 9;
  const plans = db.plans
    .map((p) => {
      const old = OLD_PLANS[p.name];
      if (!old) return p;
      const fresh = PLANS.find((x) => x.name === old.to)!;
      return { ...p, name: old.to, exercises: p.exercises.join("|") === old.exercises ? fresh.exercises : p.exercises };
    })
    .sort((a, b) => order(a.name) - order(b.name));
  return {
    ...db,
    plans,
    workouts: db.workouts.map((w) => ({ ...w, plan: rename(w.plan) })),
    session: db.session && { ...db.session, plan: rename(db.session.plan) },
  };
}

/** Sample data relative to today so every screen has something to show. */
export function makeSeed(): DB {
  const r = rng(7);
  const today = todayISO();
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const hm = (h0: number, h1: number) =>
    `${String(h0 + Math.floor(r() * (h1 - h0))).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}`;

  // Example break, mid-week so it shows sub-week positioning. No weigh-ins logged during it.
  const exampleBreak = { id: uid(), start: addDays(today, -38), end: addDays(today, -36), label: "NY Trip where we ate like a fatass" };

  const weight: WeightEntry[] = [];
  const notes: Record<number, string> = { 9: "Late salty dinner", 23: "Travel day", 40: "Poor sleep", 61: "Refeed" };
  for (let i = 83; i >= 0; i--) {
    if (i > 0 && r() < 0.16) continue;
    if (i <= 38 && i >= 36) continue;
    const trend = 176.4 - (83 - i) * 0.095;
    const lb = Math.round((trend + (r() - 0.5) * 1.6) * 10) / 10;
    const time = hm(6, 8);
    weight.push({ id: uid(), date: addDays(today, -i), time: i === 0 && time > nowHM() ? "00:00" : time, lb, note: notes[i] });
  }

  const thisWeek = weekStart(today);
  const phases = [
    { id: "ph1", name: "Maintain", start: addDays(thisWeek, -77), end: addDays(thisWeek, -50) },
    { id: "ph2", name: "Cut", start: addDays(thisWeek, -49), end: addDays(thisWeek, 6) },
  ];

  const foodPool: [string, number, number, number, number][] = [
    ["Greek yogurt, berries", 220, 22, 26, 3],
    ["Chicken rice bowl", 640, 48, 72, 14],
    ["Protein shake", 160, 30, 4, 2],
    ["Turkey sandwich", 480, 34, 48, 14],
    ["Salmon, potatoes", 610, 42, 50, 24],
    ["Oatmeal, whey", 380, 32, 52, 7],
    ["Apple", 95, 0, 25, 0],
    ["Burrito bowl", 780, 44, 86, 26],
  ];
  const food: FoodEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    const n = i === 0 ? 3 : 4 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const [name, cal, p, c, f] = pick(foodPool);
      const time = hm(7 + k * 3, 9 + k * 3);
      if (i === 0 && time > nowHM()) continue;
      food.push({
        id: uid(), date: addDays(today, -i), time,
        name, cal, p, c, f, source: pick(["typed", "typed", "saved", "estimate"] as const),
      });
    }
  }

  const problems: [string, LeetEntry["difficulty"]][] = [
    ["Two Sum", "Easy"], ["LRU Cache", "Medium"], ["Merge Intervals", "Medium"], ["Word Ladder", "Hard"],
    ["Course Schedule", "Medium"], ["Trapping Rain Water", "Hard"], ["Valid Parentheses", "Easy"],
    ["Top K Frequent Elements", "Medium"], ["Number of Islands", "Medium"], ["Median of Two Sorted Arrays", "Hard"],
    ["Coin Change", "Medium"], ["Min Stack", "Medium"], ["Climbing Stairs", "Easy"], ["Alien Dictionary", "Hard"],
  ];
  const leetcode: LeetEntry[] = problems.map(([problem, difficulty], i) => {
    const result = pick(["Solved", "Solved", "Solved", "Hint", "Failed"] as const);
    return {
      id: uid(), date: addDays(today, -Math.floor(i * 1.6)), time: hm(19, 23), problem, difficulty, result,
      minutes: 12 + Math.floor(r() * 40), redo: result !== "Solved",
      inferred: r() < 0.35 ? [pick(["difficulty", "minutes", "result"])] : undefined,
    };
  });

  const statuses = ["Applied", "OA", "Interview", "Offer", "Rejected", "No response"];
  const companies = ["Stripe", "Ramp", "Datadog", "Figma", "Notion", "Plaid", "Snowflake", "Airtable", "Retool", "Vercel", "Linear", "Brex"];
  const applications: Application[] = companies.map((company, i) => ({
    id: uid(), date: addDays(today, -i * 3 - 1), time: hm(10, 18), company,
    role: pick(["Software Engineer", "Backend Engineer", "SWE, New Grad", "Full-stack Engineer"]),
    status: i < 3 ? "Applied" : pick(statuses), source: pick(["Referral", "Careers page", "LinkedIn"]),
    link: `https://jobs.example.com/${company.toLowerCase()}`,
  }));

  const callbacks: Callback[] = [
    { company: "Ramp", type: "Interview", stage: "Onsite", debrief: "System design: rate limiter. Spent too long on the API surface, got to sharding late.\n\nBehavioral round was fine." },
    { company: "Datadog", type: "OA", stage: "Completed", debrief: "3 questions, 90 min. Got the first two, partial on the graph one." },
    { company: "Figma", type: "Recruiter", stage: "Screen", debrief: "" },
    { company: "Plaid", type: "Interview", stage: "Phone screen", debrief: "Coding: merge intervals variant. Finished with time left." },
    { company: "Notion", type: "OA", stage: "Scheduled", debrief: "" },
  ].map((c, i) => ({ id: uid(), date: addDays(today, -i * 4 - 2), time: hm(9, 17), ...c } as Callback));

  const workouts: Workout[] = [1, 3, 5, 8, 10, 12, 15].map((ago, i) => {
    const plan = PLANS[i % 3];
    const sets = plan.exercises.flatMap((exercise) =>
      [0, 1, 2].map(() => ({ exercise, weight: 45 + Math.round(r() * 30) * 5, reps: 6 + Math.floor(r() * 6), at: 0 })),
    );
    return { id: uid(), date: addDays(today, -ago), time: hm(17, 19), plan: plan.name, minutes: 55 + Math.floor(r() * 25), sets };
  });

  const note = (ago: number, text: string): Note => ({ id: uid(), date: addDays(today, -ago), time: hm(8, 22), text });

  return {
    v: 1,
    weight, phases, food, leetcode, applications, callbacks, workouts,
    foods: [
      { id: uid(), name: "Chicken breast", serving: "100 g", cal: 165, p: 31, c: 0, f: 4 },
      { id: uid(), name: "White rice", serving: "1 cup", cal: 205, p: 4, c: 45, f: 0 },
      { id: uid(), name: "Greek yogurt", serving: "170 g", cal: 100, p: 17, c: 6, f: 0 },
      { id: uid(), name: "Whey protein", serving: "1 scoop", cal: 120, p: 24, c: 3, f: 1 },
      { id: uid(), name: "Egg", serving: "1 large", cal: 72, p: 6, c: 0, f: 5 },
      { id: uid(), name: "Oats", serving: "1/2 cup", cal: 150, p: 5, c: 27, f: 3 },
    ],
    meals: [
      { id: uid(), name: "Usual breakfast", items: "Oats, whey, banana", cal: 470, p: 34, c: 78, f: 5 },
      { id: uid(), name: "Rice bowl", items: "Chicken, rice, broccoli", cal: 620, p: 50, c: 70, f: 10 },
      { id: uid(), name: "Shake", items: "Whey, milk", cal: 270, p: 32, c: 14, f: 9 },
    ],
    plans: PLANS,
    content: [
      note(2, "Video idea: what I track daily and why the weekly average matters more than the daily number."),
      note(6, "Thread draft: notes from three system design interviews."),
      note(13, "Post: the boring setup that keeps me consistent."),
    ],
    journal: [
      note(0, "Finished the ingestion refactor. Retry logic still needs tests."),
      note(1, "Pairing session on the billing bug. Root cause was a timezone boundary."),
      note(3, "Design review for the queue migration. Action items: capacity estimate, rollback plan."),
      note(7, "Shipped the export endpoint."),
    ],
    notes: [note(4, "Look into a standing desk")],
    breaks: [exampleBreak],
    settings: {
      calories: 2200, protein: 180, carbs: 220, fat: 65, restSec: 120,
      aliases: [
        { from: "ohp", to: "Overhead press" },
        { from: "rdl", to: "Romanian deadlift" },
        { from: "bowl", to: "Rice bowl" },
      ],
      statuses,
      context: "Software engineer job hunting. Cutting from 176 lb. Lifting 3x/week on a push/pull/legs split.",
    },
    chat: [],
    session: null,
  };
}
