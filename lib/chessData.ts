"use client";

// The Chess tab's data: /api/chess, refetched when the app comes back to the foreground
// (games played on chess.com show up without a reload).

import { useCallback, useEffect, useState } from "react";
import type { ChessData } from "./chess";

export function useChess() {
  const [data, setData] = useState<ChessData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chess${refresh ? "?refresh" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ChessData);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  return { data, failed, loading, reload: () => load(true) };
}
