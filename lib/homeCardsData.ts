"use client";

// The owner's home-card picks (public.home_cards), loaded once per screen and saved from
// Settings > Home cards. Until it loads (or if it can't), cards show their defaults.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { cleanPick, type CardConfig } from "./homeCards";

export function useHomeCards() {
  const [config, setConfig] = useState<CardConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    createClient().from("home_cards").select("rows").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) return setFailed(true);
      const rows = data?.rows;
      setConfig(rows && typeof rows === "object" && !Array.isArray(rows) ? (rows as CardConfig) : {});
    });
  }, []);

  /** Saves one card's rows; `null` puts it back to its defaults. */
  const save = useCallback(async (card: string, keys: string[] | null) => {
    const before = config ?? {};
    const next: CardConfig = { ...before };
    if (keys) next[card] = cleanPick(card, keys);
    else delete next[card];
    setConfig(next);
    setFailed(false);
    const { error } = await createClient().from("home_cards").update({ rows: next as never, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) {
      setConfig(before);
      setFailed(true);
    }
  }, [config]);

  return { config, failed, save };
}
