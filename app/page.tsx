"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormSheet } from "@/components/FormSheet";
import { IconArrowUp, IconMic, IconStop } from "@/components/Icons";
import { ResultCard, type CardHandlers } from "@/components/ResultCard";
import { TalosAvatar } from "@/components/TalosAvatar";
import type { ChatCard, ChatResponse, ConfirmResponse } from "@/lib/agent/cards";
import { logicalToday, uid } from "@/lib/date";
import { dataChanged, showToast, undo } from "@/lib/undo";
import { useDictation } from "@/lib/useDictation";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { CHAT_TABS, tabFromReply, type ChatTab } from "@/lib/tabs";
import { orderChips } from "@/lib/chipRank";
import { useTopChips } from "@/lib/chipRankData";
import { chatStore, useChat, type Msg } from "@/lib/chatStore";

const tabName = (k: ChatTab) => CHAT_TABS.find((t) => t.key === k)!.label;

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  // Kept outside this page, so a reply that lands while you're on another tab isn't lost.
  const { msgs, busy } = useChat();
  const { setMsgs } = chatStore;
  const [text, setText] = useState("");
  const [fillFor, setFillFor] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const dictation = useDictation(setText, (message) => showToast({ text: message, tone: "error" }));

  // Tab chips: every tab chat can log to, minus archived ones.
  const archived = useArchivedTabs() as ReadonlySet<string> | null;
  const chips = CHAT_TABS.filter((t) => !archived?.has(t.key));
  // The three you're likeliest to use at this time of day go first (lib/chipRank.ts).
  const top = useTopChips(chips.map((c) => c.key));
  const { first, rest } = orderChips(chips, top);
  const [chosen, setChosen] = useState<ChatTab | null>(null);
  useEffect(() => {
    if (chosen && archived?.has(chosen)) setChosen(null);
  }, [archived, chosen]);

  const [day, setDay] = useState(() => logicalToday());
  useEffect(() => chatStore.open(day), [day]);

  // The app can sit open overnight: when it comes back to the foreground on a new
  // day, start fresh. Never mid-conversation, only on return.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const now = logicalToday();
      if (now !== day) setDay(now);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [day]);

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
  }, [text, chips.length]);

  const append = (...m: Msg[]) => setMsgs((xs) => [...xs, ...m]);
  const reply = (card: ChatCard): Msg => ({ id: uid(), role: "app", card, ts: Date.now() });

  // Talos "speaks" (one flash) on the first card of each new reply.
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speak = (replies: Msg[], after?: string) => {
    if (after) chatStore.resolve(after, replies);
    else append(...replies);
    setSpeaking(replies[0]?.id ?? null);
    setTimeout(() => setSpeaking(null), 900);
  };
  const setCard = (id: string, fn: (c: ChatCard) => ChatCard) =>
    setMsgs((xs) => xs.map((m) => (m.id === id && m.role === "app" ? { ...m, card: fn(m.card) } : m)));

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    dictation.stop();
    setText("");
    // Naming a tab under an open "Where does this go?" sends the original message to that tab.
    const open = chosen ? null : openUnsure();
    const named = open ? tabFromReply(t) : null;
    const prompt = open && named ? promptFor(open.id) : null;
    if (open && prompt) setCard(open.id, (c) => ({ ...c, resolved: "picked" }) as ChatCard);
    // A picked tab chip goes with this one message, then clears.
    const tab = prompt ? named! : (chosen ?? undefined);
    setChosen(null);
    const user: Msg = { id: uid(), role: "user", text: t, tab, ts: Date.now(), pending: true };
    append(user);
    chatStore.wait(1);
    const res = await post<ChatResponse>("/api/chat", { text: prompt ? prompt.text : t, clientMsgId: user.id, tab });
    chatStore.wait(-1);
    const cards = res?.cards?.length ? res.cards : [{ kind: "failed" } as ChatCard];
    speak(cards.map(reply), user.id);
    if (cards.some((c) => c.kind === "saved")) dataChanged();
  };

  /** Sends a proposal to /api/confirm and adds the resulting card under the original. */
  const confirm = async (msgId: string, proposalId: string, mark: (c: ChatCard) => ChatCard, values?: Record<string, unknown>) => {
    const res = await post<ConfirmResponse>("/api/confirm", { proposalId, values });
    const cards = res?.cards?.length ? res.cards : [{ kind: "failed" } as ChatCard];
    // A bad value on a fill card leaves it open to try again.
    if (!(values && cards[0].kind === "failed")) setCard(msgId, mark);
    speak(cards.map(reply));
    if (cards.some((c) => c.kind === "saved")) dataChanged();
  };

  // An unanswered "Where does this go?" in the latest reply, if any.
  const openUnsure = () => {
    for (let j = msgs.length - 1; j >= 0 && msgs[j].role === "app"; j--) {
      const m = msgs[j];
      if (m.role === "app" && m.card.kind === "unsure" && !m.card.resolved) return m;
    }
    return null;
  };

  // The prompt behind a reply: the last user message before it.
  const promptFor = (id: string) => {
    const i = msgs.findIndex((x) => x.id === id);
    for (let j = i - 1; j >= 0; j--) {
      const x = msgs[j];
      if (x.role === "user") return x;
    }
    return null;
  };

  const handlers = (m: Extract<Msg, { role: "app" }>): CardHandlers => {
    const p = m.card.kind === "failed" ? promptFor(m.id) : null;
    return {
      retry: p
        ? () => {
            setText(p.text);
            setChosen(p.tab && !archived?.has(p.tab) ? p.tab : null);
            taRef.current?.focus();
          }
        : undefined,
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
      dismiss: () => setMsgs((xs) => xs.filter((x) => x.id !== m.id)),
    };
  };

  const fillMsg = msgs.find((m) => m.id === fillFor);
  const fillCard = fillMsg?.role === "app" && fillMsg.card.kind === "missing" ? fillMsg.card : null;

  return (
    <>
      <main className="chat">
        {msgs.length === 0 && !busy && (
          <div className="talos-hello">
            <TalosAvatar size={96} />
            <span>Log anything.</span>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="msg-user">
                {m.tab && <span className="msg-tab">{tabName(m.tab)}</span>}
                <span>{m.text}</span>
              </div>
            );
          }
          // One avatar per reply: on its first card, a spacer beside the rest.
          const first = msgs[i - 1]?.role !== "app";
          return (
            <div key={m.id} className={`talos-row${first ? " first" : ""}`}>
              <span className="holo-slot">{first && <TalosAvatar state={speaking === m.id ? "speaking" : "idle"} />}</span>
              <div className="msg-app">
                {first && <span className="talos-name">TALOS</span>}
                <ResultCard card={m.card} on={handlers(m)} />
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="talos-row first" role="status" aria-label="Talos is working">
            <span className="holo-slot">
              <TalosAvatar state="thinking" />
            </span>
            <div>
              <span className="talos-name">TALOS</span>
              <span className="talos-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
      </main>

      <div className="composer" ref={composerRef}>
        <div className="tab-chips" role="group" aria-label="Log to a tab">
          {[...first, ...rest].map((c, i) => (
            <Fragment key={c.key}>
              {i === first.length && i > 0 && <span className="tab-chips-sep" aria-hidden />}
              <button
                type="button"
                className="tab-chip"
                aria-pressed={chosen === c.key}
                onClick={() => setChosen((cur) => (cur === c.key ? null : c.key))}
              >
                {c.label}
              </button>
            </Fragment>
          ))}
        </div>
        <form
          className="composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {dictation.supported && (
            <button
              type="button"
              className={`round-btn${dictation.listening ? " listening" : ""}`}
              aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
              aria-pressed={dictation.listening}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start(text))}
            >
              {dictation.listening ? <IconStop size={18} /> : <IconMic />}
            </button>
          )}
          <div className="composer-field">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              placeholder={dictation.listening ? "Listening…" : chosen ? `Log to ${tabName(chosen)}` : "Log anything"}
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
