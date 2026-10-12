"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormSheet } from "@/components/FormSheet";
import { IconArrowUp } from "@/components/Icons";
import { ResultCard, type CardHandlers } from "@/components/ResultCard";
import type { ChatCard, ChatResponse, ConfirmResponse } from "@/lib/agent/cards";
import { unlockAudio } from "@/lib/chime";
import { uid } from "@/lib/date";
import { useStore } from "@/lib/store";
import { dataChanged, undo } from "@/lib/undo";
import { matchStart, routeWorkoutChat, startSession } from "@/lib/workoutChat";

type Msg = { id: string; role: "user"; text: string; ts: number } | { id: string; role: "app"; card: ChatCard; ts: number };

// The transcript is a per-device convenience; the data itself lives in Supabase.
const KEY = "talos.chat.v2";
const MAX_KEPT = 200;

function loadChat(): Msg[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const { db, mutate } = useStore();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fillFor, setFillFor] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMsgs(loadChat()), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-MAX_KEPT)));
    } catch {}
  }, [msgs]);

  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [msgs.length]);

  // Auto-grow the input and publish the composer height for list padding.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    }
    const h = composerRef.current?.offsetHeight ?? 72;
    document.documentElement.style.setProperty("--composer-h", `${h}px`);
  }, [text]);

  const append = (...m: Msg[]) => setMsgs((xs) => [...xs, ...m]);
  const reply = (card: ChatCard): Msg => ({ id: uid(), role: "app", card, ts: Date.now() });
  const setCard = (id: string, fn: (c: ChatCard) => ChatCard) =>
    setMsgs((xs) => xs.map((m) => (m.id === id && m.role === "app" ? { ...m, card: fn(m.card) } : m)));

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    const user: Msg = { id: uid(), role: "user", text: t, ts: Date.now() };

    // Workouts still run on local data: "start push", and sets during an active workout.
    const plan = matchStart(t, db);
    if (plan) {
      unlockAudio(); // iOS needs a tap to enable the rest-timer sound
      mutate((d) => startSession(d, plan));
      append(user, reply({ kind: "saved", label: `Started ${plan.name}`, actionId: null }));
      router.push("/workout");
      return;
    }
    const set = routeWorkoutChat(t, db);
    if (set) {
      mutate(() => set.db);
      append(user, reply(set.card.kind === "saved" ? { kind: "saved", label: set.card.label, actionId: null } : { kind: "failed" }));
      return;
    }

    append(user);
    setBusy(true);
    const res = await post<ChatResponse>("/api/chat", { text: t, clientMsgId: user.id });
    setBusy(false);
    const cards = res?.cards?.length ? res.cards : [{ kind: "failed" } as ChatCard];
    append(...cards.map(reply));
    if (cards.some((c) => c.kind === "saved")) dataChanged();
  };

  /** Sends a proposal to /api/confirm and adds the resulting card under the original. */
  const confirm = async (msgId: string, proposalId: string, mark: (c: ChatCard) => ChatCard, values?: Record<string, unknown>) => {
    const res = await post<ConfirmResponse>("/api/confirm", { proposalId, values });
    const cards = res?.cards?.length ? res.cards : [{ kind: "failed" } as ChatCard];
    // A bad value on a fill card leaves it open to try again.
    if (!(values && cards[0].kind === "failed")) setCard(msgId, mark);
    append(...cards.map(reply));
    if (cards.some((c) => c.kind === "saved")) dataChanged();
  };

  const handlers = (m: Extract<Msg, { role: "app" }>): CardHandlers => ({
    undo: async () => {
      if (m.card.kind !== "saved" || !m.card.actionId) return;
      const r = await undo(m.card.actionId);
      if (r.status === "done") setCard(m.id, (c) => ({ ...c, undone: true }) as ChatCard);
    },
    choose: (i) => {
      if (m.card.kind !== "unsure") return;
      confirm(m.id, m.card.options[i].proposalId, (c) => ({ ...c, resolved: "picked" }) as ChatCard);
    },
    save: () => {
      if (m.card.kind !== "warning") return;
      confirm(m.id, m.card.proposalId, (c) => ({ ...c, resolved: "saved" }) as ChatCard);
    },
    edit: () => {
      if (m.card.kind !== "warning") return;
      setText(m.card.text);
      setCard(m.id, (c) => ({ ...c, resolved: "edit" }) as ChatCard);
      taRef.current?.focus();
    },
    confirm: () => {
      if (m.card.kind !== "confirm") return;
      confirm(m.id, m.card.proposalId, (c) => ({ ...c, resolved: "confirmed" }) as ChatCard);
    },
    cancel: () => setCard(m.id, (c) => ({ ...c, resolved: "cancelled" }) as ChatCard),
    fill: () => setFillFor(m.id),
  });

  const fillMsg = msgs.find((m) => m.id === fillFor);
  const fillCard = fillMsg?.role === "app" && fillMsg.card.kind === "missing" ? fillMsg.card : null;

  return (
    <>
      <main className="chat">
        {msgs.length === 0 && <p className="chat-empty">Log anything.</p>}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg-user">
              <span>{m.text}</span>
            </div>
          ) : (
            <div key={m.id} className="msg-app">
              <ResultCard card={m.card} on={handlers(m)} />
            </div>
          ),
        )}
        {busy && <p className="chat-empty faint">…</p>}
      </main>

      <div className="composer" ref={composerRef}>
        <form
          className="composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="composer-field">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              placeholder="Log anything"
              enterKeyHint="send"
              autoCapitalize="sentences"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <button type="submit" className="round-btn send" aria-label="Send" disabled={!text.trim() || busy}>
            <IconArrowUp />
          </button>
        </form>
      </div>

      {fillCard && fillFor && (
        <FormSheet
          title={fillCard.title}
          fields={fillCard.missing.map((f) => ({
            name: f.name,
            label: f.optional ? `${f.label} (optional)` : f.label,
            type: f.type ?? ("number" as const),
            options: f.type === "select" ? ["", ...(f.options ?? [])] : undefined,
            optional: true,
            full: f.type === "text",
          }))}
          initial={{}}
          validate={(v) =>
            fillCard.missing.some((f) => {
              if (f.optional) return false;
              const x = v[f.name];
              return (f.type ?? "number") === "number" ? x == null || !Number.isFinite(x) : !String(x ?? "").trim();
            })
              ? "Fill in every required field."
              : null
          }
          onClose={() => setFillFor(null)}
          onSubmit={(v) => {
            const id = fillFor;
            setFillFor(null);
            confirm(id, fillCard.proposalId, (c) => ({ ...c, resolved: "filled" }) as ChatCard, v);
          }}
        />
      )}
    </>
  );
}
