// End of day (EOD): shared by the chat page (the interview), Settings (the questions)
// and /api/eod (the parse). No server or model code here.

export const EOD_TARGETS = [
  { key: "journal", label: "Work journal", tab: "journal" },
  { key: "personal", label: "Personal journal", tab: "personal" },
  { key: "content", label: "Content idea", tab: "content" },
  { key: "talos", label: "Talos improvement", tab: "talos" },
  { key: "spending", label: "Spending", tab: "spending" },
] as const;

export type EodTarget = (typeof EOD_TARGETS)[number]["key"];
export type EodNoteKind = Exclude<EodTarget, "spending">;

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

export interface EodDraft {
  notes: EodNote[];
  spending: EodSpend[];
  /** Answers that couldn't become an entry, said back to the owner. */
  unclear: string[];
}
