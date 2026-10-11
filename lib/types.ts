export type ID = string;

export interface Dated {
  id: ID;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  deleted?: boolean;
}

export interface WeightEntry extends Dated {
  lb: number;
  note?: string;
}

export type FoodSource = "typed" | "saved" | "estimate";

export interface FoodEntry extends Dated {
  name: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  source: FoodSource;
}

export interface Food {
  id: ID;
  name: string;
  serving: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  deleted?: boolean;
}

export interface SavedMeal {
  id: ID;
  name: string;
  items: string;
  cal: number;
  p: number;
  c: number;
  f: number;
  deleted?: boolean;
}

export type Difficulty = "Easy" | "Medium" | "Hard";
export type LcResult = "Solved" | "Hint" | "Failed";

export interface LeetEntry extends Dated {
  problem: string;
  difficulty: Difficulty;
  result: LcResult;
  minutes: number;
  redo: boolean;
  inferred?: string[];
}

export interface Application extends Dated {
  company: string;
  role: string;
  status: string;
  source: string;
  link?: string;
}

export type CallbackType = "Interview" | "OA" | "Recruiter";

export interface Callback extends Dated {
  company: string;
  type: CallbackType;
  stage: string;
  debrief: string;
}

export interface LoggedSet {
  exercise: string;
  weight: number;
  reps: number;
  at: number;
}

export interface Workout extends Dated {
  plan: string;
  minutes: number;
  sets: LoggedSet[];
}

export interface Plan {
  id: ID;
  name: string;
  exercises: string[];
  deleted?: boolean;
}

export interface Note extends Dated {
  text: string;
}

export interface Phase {
  id: ID;
  name: string;
  start: string;
  end: string;
}

export interface Alias {
  from: string;
  to: string;
}

export interface Settings {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  restSec: number;
  aliases: Alias[];
  statuses: string[];
  context: string;
}

export interface Session {
  plan: string;
  startedAt: number;
  sets: LoggedSet[];
  restEndsAt: number | null;
  current: string;
}

export interface Collections {
  weight: WeightEntry[];
  food: FoodEntry[];
  foods: Food[];
  meals: SavedMeal[];
  leetcode: LeetEntry[];
  applications: Application[];
  callbacks: Callback[];
  workouts: Workout[];
  plans: Plan[];
  content: Note[];
  journal: Note[];
  notes: Note[];
}

export type Coll = keyof Collections;
export type Item<K extends Coll> = Collections[K][number];
export type AnyItem = Item<Coll>;

/** A deferred write. Cards hold these until the owner confirms. */
export type Pending =
  | { op: "add"; coll: Coll; item: AnyItem }
  | { op: "update"; coll: Coll; id: ID; patch: Record<string, unknown> }
  | { op: "remove"; coll: Coll; id: ID }
  | { op: "purge"; coll: Coll; id: ID }
  | { op: "settings"; patch: Partial<Settings> };

export interface Change {
  field: string;
  from: string;
  to: string;
}

export interface Option {
  tool: string;
  fields: [string, string][];
  pending: Pending;
}

export type Card =
  | { kind: "saved"; label: string; undo?: Pending; undone?: boolean }
  | { kind: "unsure"; options: Option[]; note: Pending }
  | { kind: "warning"; detail: string; pending: Pending; text: string; resolved?: "edit" }
  | { kind: "confirm"; title: string; changes: Change[]; pending: Pending; resolved?: "cancelled" }
  | { kind: "missing"; tool: string; missing: string[]; draft: Partial<Application>; resolved?: "cancelled" }
  | { kind: "query"; title: string; value?: string; unit?: string; table?: { cols: string[]; rows: string[][] } }
  | { kind: "failed" };

/** What the interpreter returns: a card, or a write to perform immediately. */
export type Interpretation = Card | { kind: "save"; pending: Pending };

export type ChatMsg =
  | { id: ID; role: "user"; text: string; image?: string; ts: number }
  | { id: ID; role: "app"; card: Card; ts: number };

export interface DB extends Collections {
  v: 1;
  phases: Phase[];
  settings: Settings;
  chat: ChatMsg[];
  session: Session | null;
}
