"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormSheet } from "@/components/FormSheet";
import { IconArrowUp, IconCamera, IconX } from "@/components/Icons";
import { ResultCard, type CardHandlers } from "@/components/ResultCard";
import { applyPending } from "@/lib/apply";
import { unlockAudio } from "@/lib/chime";
import { nowHM, todayISO, uid } from "@/lib/date";
import { interpret, interpretPhoto } from "@/lib/interpret";
import { useStore } from "@/lib/store";
import type { Application, Card, ChatMsg, DB, Interpretation, Pending } from "@/lib/types";
import { matchStart, routeWorkoutChat, startSession } from "@/lib/workoutChat";

/** Applies a pending write and turns it into a Saved card; any error becomes Failed. */
function commit(db: DB, p: Pending): { db: DB; card: Card } {
  try {
    const r = applyPending(db, p);
    return { db: r.db, card: { kind: "saved", label: r.label, undo: r.undo } };
  } catch {
    return { db, card: { kind: "failed" } };
  }
}

function resolve(db: DB, i: Interpretation): { db: DB; card: Card } {
  return i.kind === "save" ? commit(db, i.pending) : { db, card: i };
}

/** Downscale a photo to a small thumbnail so it fits in local storage. */
function thumbnail(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = 280;
      const c = document.createElement("canvas");
      const k = Math.max(s / img.width, s / img.height);
      c.width = s;
      c.height = s;
      c.getContext("2d")!.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

export default function ChatPage() {
  const { db, mutate } = useStore();
  const router = useRouter();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [fillFor, setFillFor] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [db.chat.length]);

  // Auto-grow the input and publish the composer height for list padding.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    }
    const h = composerRef.current?.offsetHeight ?? 72;
    document.documentElement.style.setProperty("--composer-h", `${h}px`);
  }, [text, image]);

  const send = () => {
    const t = text.trim();
    if (!t && !image) return;
    const img = image;
    setText("");
    setImage(null);

    // "start push": begin the workout and switch to its tab. Audio unlocks inside this tap.
    const plan = img ? null : matchStart(t, db);
    if (plan) {
      unlockAudio();
      mutate((d) => {
        const user: ChatMsg = { id: uid(), role: "user", text: t, ts: Date.now() };
        const reply: ChatMsg = { id: uid(), role: "app", card: { kind: "saved", label: `Started ${plan.name}` }, ts: Date.now() };
        return { ...startSession(d, plan), chat: [...d.chat, user, reply] };
      });
      router.push("/workout");
      return;
    }

    mutate((d) => {
      const user: ChatMsg = { id: uid(), role: "user", text: t, image: img ?? undefined, ts: Date.now() };
      let out: { db: DB; card: Card };
      try {
        // During a workout, set messages ("135x8", "ohp 95x6") log to it.
        out = (!img && routeWorkoutChat(t, d)) || resolve(d, img ? interpretPhoto(t) : interpret(t, d));
      } catch {
        out = { db: d, card: { kind: "failed" } };
      }
      const reply: ChatMsg = { id: uid(), role: "app", card: out.card, ts: Date.now() };
      return { ...out.db, chat: [...d.chat, user, reply] };
    });
  };

  /** Replace a card in place, optionally writing to the db. */
  const act = (msgId: string, fn: (db: DB, card: Card) => { db: DB; card: Card }) =>
    mutate((d) => {
      const msg = d.chat.find((m) => m.id === msgId);
      if (!msg || msg.role !== "app") return d;
      const r = fn(d, msg.card);
      return { ...r.db, chat: r.db.chat.map((m) => (m.id === msgId ? { ...m, card: r.card } : m)) };
    });

  const handlers = (m: Extract<ChatMsg, { role: "app" }>): CardHandlers => ({
    undo: () =>
      act(m.id, (d, c) => {
        if (c.kind !== "saved" || !c.undo) return { db: d, card: c };
        try {
          return { db: applyPending(d, c.undo).db, card: { ...c, undone: true } };
        } catch {
          return { db: d, card: { kind: "failed" } };
        }
      }),
    choose: (i) => act(m.id, (d, c) => (c.kind === "unsure" ? commit(d, c.options[i].pending) : { db: d, card: c })),
    saveNote: () => act(m.id, (d, c) => (c.kind === "unsure" ? commit(d, c.note) : { db: d, card: c })),
    save: () => act(m.id, (d, c) => (c.kind === "warning" ? commit(d, c.pending) : { db: d, card: c })),
    edit: () => {
      if (m.card.kind === "warning") setText(m.card.text);
      act(m.id, (d, c) => ({ db: d, card: c.kind === "warning" ? { ...c, resolved: "edit" } : c }));
      taRef.current?.focus();
    },
    confirm: () => act(m.id, (d, c) => (c.kind === "confirm" ? commit(d, c.pending) : { db: d, card: c })),
    cancel: () =>
      act(m.id, (d, c) => ({ db: d, card: c.kind === "confirm" || c.kind === "missing" ? { ...c, resolved: "cancelled" } : c })),
    fill: () => setFillFor(m.id),
  });

  const fillMsg = db.chat.find((m) => m.id === fillFor);
  const draft = fillMsg?.role === "app" && fillMsg.card.kind === "missing" ? fillMsg.card.draft : null;

  return (
    <>
      <main className="chat">
        {db.chat.length === 0 && <p className="chat-empty">Log anything.</p>}
        {db.chat.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg-user">
              {m.image && <img src={m.image} alt="" />}
              {m.text && <span>{m.text}</span>}
            </div>
          ) : (
            <div key={m.id} className="msg-app">
              <ResultCard card={m.card} on={handlers(m)} />
            </div>
          ),
        )}
      </main>

      <div className="composer" ref={composerRef}>
        <form
          className="composer-inner"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button type="button" className="round-btn" aria-label="Add photo" onClick={() => fileRef.current?.click()}>
            <IconCamera />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setImage(await thumbnail(f).catch(() => null));
            }}
          />
          <div className="composer-field">
            {image && (
              <div className="composer-attach">
                <img src={image} alt="Attached photo" />
                <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setImage(null)}>
                  <IconX size={16} />
                </button>
              </div>
            )}
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              placeholder="Log or ask"
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
          <button type="submit" className="round-btn send" aria-label="Send" disabled={!text.trim() && !image}>
            <IconArrowUp />
          </button>
        </form>
      </div>

      {draft && fillFor && (
        <FormSheet
          title="Application"
          fields={[
            { name: "company", label: "Company" },
            { name: "role", label: "Role" },
            { name: "source", label: "Source", placeholder: "Referral, LinkedIn, careers page" },
            { name: "link", label: "Link", placeholder: "Optional" },
            { name: "status", label: "Status", type: "select", options: db.settings.statuses },
          ]}
          initial={{ status: "Applied", ...draft }}
          onClose={() => setFillFor(null)}
          onSubmit={(v) => {
            const item = { id: uid(), date: todayISO(), time: nowHM(), ...v } as unknown as Application;
            act(fillFor, (d) => commit(d, { op: "add", coll: "applications", item }));
            setFillFor(null);
          }}
        />
      )}
    </>
  );
}
