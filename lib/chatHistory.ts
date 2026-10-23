"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ChatCard } from "./agent/cards";
import { toHM } from "./date";
import { isChatTab, type ChatTab } from "./tabs";

/** One past message: what was typed, the cards it got, then any cards from tapping those. */
export interface HistoryMsg {
  id: string;
  time: string;
  text: string;
  tab?: ChatTab;
  cards: ChatCard[];
}

/** Days with chat, newest first, by the 4am rule in the Settings timezone (from message_log). */
export function useChatDays() {
  const [days, setDays] = useState<{ day: string; n: number }[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await createClient().rpc("chat_days");
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setDays(data);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { days, failed, reload };
}

/** One day's messages, oldest first. A message the server never answered shows as failed. */
export function useChatDay(day: string) {
  const [msgs, setMsgs] = useState<HistoryMsg[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setMsgs(null);
    const { data, error } = await createClient().rpc("chat_day", { p_day: day });
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setMsgs(
      data.map((m) => {
        const reply = (m.response as { cards?: ChatCard[] } | null)?.cards ?? [];
        const followups = ((m.followups as ChatCard[][] | null) ?? []).flat();
        return {
          id: m.id,
          time: toHM(new Date(m.created_at)),
          text: m.text,
          tab: isChatTab(m.tab) ? m.tab : undefined,
          cards: [...(reply.length ? reply : [{ kind: "failed" } as ChatCard]), ...followups],
        };
      }),
    );
  }, [day]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { msgs, failed, reload };
}
