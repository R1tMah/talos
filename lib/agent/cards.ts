// What /api/chat and /api/confirm return. Every card is built by code from stored
// rows or checked values; the model never writes any of this text.
//
// Writes that wait on the owner point at a server-side proposal by id, so the
// client can choose one but can't change what it says.

import type { EodEntry, EodNote, EodQa, EodReminder, EodSpend } from "@/lib/eod";
import type { Change } from "@/lib/types";

export interface CardOption {
  tool: string; // display name, e.g. "Saved meal"
  fields: [string, string][];
  proposalId: string;
  tab?: string; // the tab it would save to
}

export interface MissingField {
  name: string;
  label: string;
  type?: "number" | "text" | "date" | "time" | "select"; // default number
  options?: string[]; // for select
  optional?: boolean; // asked, but may be left blank
}

export type ChatCard =
  | { kind: "saved"; label: string; actionId: string | null; googleEvent?: { calendarId: string; eventId: string }; undone?: boolean }
  // `suggested`: the tab the owner chose for a message like this before (lib/agent/learned.ts).
  | { kind: "unsure"; options: CardOption[]; title?: string; suggested?: string; resolved?: "picked" }
  // Also used for "ask first" confirmations (a calendar event): then `title` and `action` replace the warning wording.
  | { kind: "warning"; detail: string; proposalId: string; text: string; title?: string; action?: string; resolved?: "saved" | "edit" }
  | { kind: "confirm"; title: string; changes: Change[]; proposalId: string; resolved?: "confirmed" | "cancelled" }
  | { kind: "missing"; title: string; missing: MissingField[]; proposalId: string; resolved?: "filled" | "cancelled" }
  | { kind: "failed"; detail?: string }
  // End of day: what will be saved, waiting on Save EOD (lib/eod.ts, /api/eod).
  // `reminders`: open ones due today or overdue, to tick off on the card.
  | {
      kind: "eod"; date: string; notes: EodNote[]; spending: EodSpend[]; answers?: EodQa[]; reminders?: EodReminder[]; unclear?: string[];
      /** Other tabs' entries (a weigh-in, a run), saved through each tab's tool after the rest. */
      entries?: EodEntry[];
      proposalId: string; resolved?: "saved" | "cancelled";
    }
  // An EOD interview question. Asked by the chat page itself, never by the server.
  | { kind: "ask"; text: string; step: number; of: number; resolved?: "answered" | "skipped" | "cancelled" }
  // After food is logged: that day's totals against its targets, read from the database (no model).
  | { kind: "left"; date: string; cal: number; calTarget: number; protein: number; proteinTarget: number };

export interface ChatResponse {
  cards: ChatCard[];
}

export interface ConfirmRequest {
  proposalId: string;
  /** Values for a missing-fields card, keyed by MissingField.name. */
  values?: Record<string, number | string>;
}

export interface ConfirmResponse {
  cards: ChatCard[];
}
