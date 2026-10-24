"use client";

import { useSyncExternalStore } from "react";
import type { ChatCard, ChatResponse } from "./agent/cards";
import { uid } from "./date";
import type { ChatTab } from "./tabs";
import { dataChanged } from "./undo";

export type Msg =
  /** `pending` until its reply is in, so a reply cut off by closing the app can be fetched later. */
  | { id: string; role: "user"; text: string; tab?: ChatTab; ts: number; pending?: boolean }
  | { id: string; role: "app"; card: ChatCard; ts: number };

// The transcript is a per-device convenience; the data itself lives in Supabase.
// It only covers one logical day (the app's 4am rule): a new day starts empty.
//
// It lives here, outside the Chat page, so a reply that lands after you switch tabs
// still gets added (and saved) and is there when you come back. A reply cut off by
// closing or reloading the app is asked for again when the transcript next loads.
const KEY = "talos.chat.v3";
const MAX_KEPT = 200;

function loadChat(day: string): Msg[] {
  try {
    localStorage.removeItem("talos.chat.v2"); // the old, never-cleared transcript
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as { day?: string; msgs?: Msg[] }) : null;
    return saved?.day === day && Array.isArray(saved.msgs) ? saved.msgs : [];
  } catch {
    return [];
  }
}

interface ChatState {
  day: string | null;
  msgs: Msg[];
  /** Replies still being waited on (a send, or a recovery after reload). */
  waiting: number;
}

const EMPTY: ChatState = { day: null, msgs: [], waiting: 0 };
let state = EMPTY;
const subscribers = new Set<() => void>();

function set(next: Partial<ChatState>) {
  state = { ...state, ...next };
  if (next.msgs || next.day) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: state.day, msgs: state.msgs.slice(-MAX_KEPT) }));
    } catch {}
  }
  subscribers.forEach((f) => f());
}

export const chatStore = {
  /** Shows a logical day: a different day loads its saved transcript; the same day keeps what's in memory. */
  open(day: string) {
    if (state.day === day) return;
    set({ day, msgs: loadChat(day) });
    for (const m of state.msgs) if (m.role === "user" && m.pending) recover(m.id);
  },
  setMsgs(fn: (msgs: Msg[]) => Msg[]) {
    set({ msgs: fn(state.msgs) });
  },
  /** Counts a reply being waited on (+1) or done (-1); the page shows "working" while any are out. */
  wait(n: 1 | -1) {
    set({ waiting: Math.max(0, state.waiting + n) });
  },
  /** A message's reply is in: it stops being pending and the cards go right under it. */
  resolve(userId: string, replies: Msg[]) {
    const i = state.msgs.findIndex((m) => m.id === userId);
    if (i < 0) return set({ msgs: [...state.msgs, ...replies] });
    const msgs = state.msgs.map((m) => (m.id === userId && m.role === "user" ? { ...m, pending: false } : m));
    msgs.splice(i + 1, 0, ...replies);
    set({ msgs });
  },
};

const RECOVER_TRIES = 45; // every 2s: a minute and a half, past any real reply time
const recovering = new Set<string>();

/** Asks the server for the reply to a message sent before the app was closed. */
async function recover(id: string) {
  if (recovering.has(id)) return;
  recovering.add(id);
  chatStore.wait(1);
  let cards: ChatCard[] = [{ kind: "failed" }];
  for (let i = 0; i < RECOVER_TRIES; i++) {
    const r = await fetch(`/api/chat?clientMsgId=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ status: string } & Partial<ChatResponse>>) : null))
      .catch(() => null);
    if (r?.status === "done" && r.cards?.length) {
      cards = r.cards;
      break;
    }
    // Never arrived, or stopped partway: show it failed (Retry brings the text back). "Unknown"
    // gets a few seconds first, in case the request left just before the reload and is still landing.
    if (r?.status === "failed" || (r?.status === "unknown" && i >= 2)) break;
    await new Promise((done) => setTimeout(done, 2000)); // still working, or offline for a moment
  }
  chatStore.resolve(id, cards.map((card) => ({ id: uid(), role: "app", card, ts: Date.now() })));
  chatStore.wait(-1);
  recovering.delete(id);
  if (cards.some((c) => c.kind === "saved")) dataChanged();
}

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => {
    subscribers.delete(f);
  };
};

/** The transcript and whether a reply is pending, kept across visits to the Chat page. */
export function useChat() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  return { msgs: s.msgs, busy: s.waiting > 0 };
}
