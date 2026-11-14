// End of day (EOD): shared by the chat page (the interview), Settings (the questions)
// and /api/eod (the parse). No server or model code here.

export const EOD_TARGETS = [
  { key: "journal", label: "Work journal", tab: "journal" },
  { key: "personal", label: "Personal journal", tab: "personal" },
  { key: "content", label: "Content idea", tab: "content" },
  { key: "talos", label: "Talos improvement", tab: "talos" },
  { key: "spending", label: "Spending", tab: "spending" },
  // Anything else: the answer is kept under its question (public.eod_answers), listed in
  // Settings > End of day. Not a tab, so it's never archived.
  { key: "custom", label: "Its own log", tab: "eod" },
  // Every other tab chat logs to. The answer is read like a chat message with that tab's
  // chip picked (lib/agent/scope.ts), and saved through the same tools when you tap Save EOD.
  { key: "weight", label: "Weight", tab: "weight" },
  { key: "nutrition", label: "Food", tab: "nutrition" },
  { key: "leetcode", label: "LeetCode", tab: "leetcode" },
  { key: "runs", label: "Runs", tab: "runs" },
  { key: "applications", label: "Applications", tab: "applications" },
  { key: "callbacks", label: "Callbacks (OAs, interviews)", tab: "callbacks" },
  { key: "subscriptions", label: "Subscriptions", tab: "subscriptions" },
  { key: "experiences", label: "Recommendations", tab: "experiences" },
  { key: "reminders", label: "New reminders", tab: "reminders" }, // not archivable
] as const;

export type EodTarget = (typeof EOD_TARGETS)[number]["key"];
export type EodNoteKind = "journal" | "personal" | "content" | "talos";

/** Targets saved by EOD's own transaction; every other one goes through a tab's chat tools. */
const OWN = new Set<EodTarget>(["journal", "personal", "content", "talos", "spending", "custom"]);
export type EodToolTarget = Exclude<EodTarget, EodNoteKind | "spending" | "custom">;
export const isToolTarget = (t: EodTarget): t is EodToolTarget => !OWN.has(t);

/** A question to start from when a target is picked in Settings. */
export const DEFAULT_PROMPT: Record<EodTarget, string> = {
  journal: "Work journal: what got done, learned, or decided today?",
  personal: "Personal journal: what's on your mind?",
  content: "Any content ideas today?",
  talos: "Anything to fix or add in Talos?",
  spending: "Any cash or Venmo spending today?",
  custom: "What else happened today?",
  weight: "Did you weigh in today? What was it?",
  nutrition: "What did you eat today that isn't logged yet?",
  leetcode: "Any LeetCode today? Which problems, and how did they go?",
  runs: "Did you run today? How far and how long?",
  applications: "Did you apply anywhere today?",
  callbacks: "Any OAs, interviews or recruiter calls today?",
  subscriptions: "Start or cancel any subscriptions?",
  experiences: "Try anything new worth remembering (a place, show, book)?",
  reminders: "Anything to remind yourself about?",
};

export const isEodTarget = (v: unknown): v is EodTarget => EOD_TARGETS.some((t) => t.key === v);
export const targetLabel = (t: EodTarget) => EOD_TARGETS.find((x) => x.key === t)!.label;
/** The tab a target writes to (archived tabs aren't asked about). */
export const targetTab = (t: EodTarget) => EOD_TARGETS.find((x) => x.key === t)!.tab;

export interface EodQuestion {
  id: string;
  position: number;
  prompt: string;
  target: EodTarget;
  enabled: boolean;
}

/** One answer from the interview, tagged with where it goes. */
export interface EodAnswer {
  target: EodTarget;
  text: string;
  /** Own-log answers: the question answered. The server reads its wording from the database. */
  questionId?: string;
}

/** A one-shot needs this much after "EOD" to be worth parsing; less starts the interview. */
const ONE_SHOT_MIN = 12;

/**
 * "EOD" (or "eod.", "End of day") starts the interview. "EOD: shipped auth, tired, $12 lunch"
 * skips it and goes straight to the parser with everything after the label.
 */
export function eodCommand(text: string): { kind: "start" } | { kind: "oneShot"; text: string } | null {
  const t = text.trim();
  if (/^(?:eod|end of (?:the )?day)[.!]?$/i.test(t)) return { kind: "start" };
  const m = t.match(/^(?:eod|end of (?:the )?day)\s*[:\-–—,]\s*([\s\S]+)$/i) ?? t.match(/^eod\s+([\s\S]+)$/i);
  if (m && m[1].trim().length >= ONE_SHOT_MIN) return { kind: "oneShot", text: m[1].trim() };
  return null;
}

/** "skip", "no", "nothing", "none", "n/a", "-": nothing to log for this question. */
export const isSkip = (text: string) => /^\s*(?:skip|no|nope|nothing|none|nah|n\/?a|-+|no spending|nothing today)\s*[.!]?\s*$/i.test(text);

/** "cancel", "stop", "quit": leave the interview without saving. */
export const isCancel = (text: string) => /^\s*(?:cancel|stop|quit|exit|never ?mind)\s*[.!]?\s*$/i.test(text);

// ---- What /api/eod puts on the card ----------------------------------------------------

export interface EodNote {
  kind: EodNoteKind;
  body: string;
}
/** An own-log answer: saved under its question, worded as it was asked. */
export interface EodQa {
  questionId: string | null;
  prompt: string;
  body: string;
}
export interface EodSpend {
  amount: number;
  what: string;
  category: string;
}
/** An open reminder due today or earlier, offered on the EOD card to tick off. */
export interface EodReminder {
  id: string;
  body: string;
  due: string | null;
}

/**
 * The EOD button shows from 10 PM until the app's day rolls over at 4 AM
 * (a 1 AM session is still "tonight").
 */
export const EOD_FROM_HOUR = 22;
export const isEodTime = (now = new Date()) => now.getHours() >= EOD_FROM_HOUR || now.getHours() < 4;

/** A tab entry read from an answer (a weigh-in, a run, a LeetCode problem), as the card shows it. */
export interface EodEntry {
  target: EodTarget;
  title: string; // the tool's name, e.g. "Run"
  fields: [string, string][];
}

export interface EodDraft {
  notes: EodNote[];
  spending: EodSpend[];
  answers: EodQa[];
  /** Answers that couldn't become an entry, said back to the owner. */
  unclear: string[];
}
