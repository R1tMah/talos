"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { IconChevron } from "@/components/Icons";
import { ResultCard } from "@/components/ResultCard";
import { PageSkeleton } from "@/components/Skeleton";
import { TalosAvatar } from "@/components/TalosAvatar";
import { EmptyState, ScreenHeader } from "@/components/ui";
import { useChatDay, useChatDays } from "@/lib/chatHistory";
import { fmtDay, fmtDow, logicalToday } from "@/lib/date";
import { CHAT_TABS } from "@/lib/tabs";

const dayName = (d: string) => (d === logicalToday() ? "Today" : `${fmtDow(d)}, ${fmtDay(d)}`);

function Failed({ title, back, retry }: { title: string; back: string; retry: () => void }) {
  return (
    <main className="screen">
      <ScreenHeader title={title} back={back} />
      <p role="alert" className="muted">
        Failed.{" "}
        <button type="button" className="btn btn-sm" onClick={retry}>
          Retry
        </button>
      </p>
    </main>
  );
}

/** Every day with chat, newest first. */
function Days() {
  const { days, failed, reload } = useChatDays();
  if (!days) return failed ? <Failed title="Chat history" back="/settings" retry={reload} /> : <PageSkeleton />;
  return (
    <main className="screen">
      <ScreenHeader title="Chat history" back="/settings" />
      {days.length === 0 ? (
        <div className="card">
          <EmptyState text="No chats yet." />
        </div>
      ) : (
        <div className="card list">
          {days.map((d) => (
            <Link key={d.day} href={`/settings/chat-history?day=${d.day}`} className="row">
              <span className="row-label">{dayName(d.day)}</span>
              <span className="row-value num">
                {d.n} {d.n === 1 ? "message" : "messages"}
              </span>
              <IconChevron />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

/** One day, read-only: each message with the cards it got, laid out like chat. */
function Day({ day }: { day: string }) {
  const { msgs, failed, reload } = useChatDay(day);
  const title = dayName(day);
  if (!msgs) return failed ? <Failed title={title} back="/settings/chat-history" retry={reload} /> : <PageSkeleton />;
  return (
    <main className="screen">
      <ScreenHeader title={title} back="/settings/chat-history" />
      {msgs.length === 0 ? (
        <div className="card">
          <EmptyState text="No messages." />
        </div>
      ) : (
        <div className="history-log">
          {msgs.map((m) => (
            <div key={m.id} className="history-log">
              <div className="msg-user">
                {m.tab && <span className="msg-tab">{CHAT_TABS.find((t) => t.key === m.tab)!.label}</span>}
                <span>{m.text}</span>
                <span className="msg-time num">{m.time}</span>
              </div>
              {m.cards.map((c, i) => (
                <div key={i} className={`talos-row${i === 0 ? " first" : ""}`}>
                  <span className="holo-slot">{i === 0 && <TalosAvatar />}</span>
                  <div className="msg-app">
                    <ResultCard card={c} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function ChatHistory() {
  const day = useSearchParams().get("day");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? <Day day={day} /> : <Days />;
}

export default function ChatHistoryPage() {
  return (
    <Suspense>
      <ChatHistory />
    </Suspense>
  );
}
