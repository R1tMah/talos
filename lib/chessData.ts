"use client";

// The Chess tab's data: /api/chess, refetched when the app comes back to the foreground
// (games played on chess.com show up without a reload), plus the owner's notes on games
// (public.chess_notes, keyed by the game's chess.com URL since games aren't stored).

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { MONTHS_DEFAULT, type ChessData } from "./chess";
import type { Json } from "./database.types";
import { announceWrite, useDataChanged } from "./undo";

/**
 * Ratings and the games in the last `months` monthly archives. When `months` changes, the
 * data already loaded stays shown (with `loading` on) until the bigger range arrives; only
 * the latest request's answer is kept.
 */
export function useChess(months = MONTHS_DEFAULT) {
  const [data, setData] = useState<ChessData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const q = [months !== MONTHS_DEFAULT ? `months=${months}` : "", refresh ? "refresh" : ""].filter(Boolean).join("&");
      const res = await fetch(`/api/chess${q ? `?${q}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ChessData;
      if (id !== latest.current) return;
      setData(next);
      setFailed(false);
    } catch {
      if (id === latest.current) setFailed(true);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    load();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  return { data, failed, loading, reload: () => load(true) };
}

/**
 * Live notes on these games: game URL -> note. `loaded` is true once the notes for exactly
 * these games have been read, so a missing note means there is none (not "not read yet").
 * Call `reload` after a write.
 */
export function useChessNotes(urls: string[]) {
  const [read, setRead] = useState<{ key: string; notes: Record<string, string> } | null>(null);
  const key = urls.join("\n");
  // Every read is of the games shown now (a reload from a save started on another day reads
  // this day's), and only the latest read lands, so a slow one can't replace a newer one.
  const shown = useRef(key);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    const k = shown.current;
    const list = k ? k.split("\n") : [];
    if (!list.length) return setRead({ key: k, notes: {} });
    const res = await createClient().from("chess_notes").select("game_url, body").in("game_url", list).is("deleted_at", null);
    if (id !== latest.current) return;
    if (res.error) return; // keep what's shown; the games still work without notes
    setRead({ key: k, notes: Object.fromEntries(res.data.map((r) => [r.game_url, r.body])) });
  }, []);

  useDataChanged(reload);

  useEffect(() => {
    shown.current = key;
    reload();
  }, [key, reload]);

  return { notes: read?.notes ?? {}, loaded: read?.key === key, reload };
}

export type NoteResult = { status: "saved" } | { status: "failed" };

/** One write: blank text removes the note; anything else adds or replaces it, saved as typed. */
export const chessNotesApi = {
  set: async (url: string, body: string): Promise<NoteResult> => {
    const res = await createClient().rpc("set_chess_note", { p_url: url, p_body: body });
    const out = res.data as { status?: string; row?: Json; action_id?: string | null } | null;
    if (res.error || !out) return { status: "failed" };
    announceWrite("chess_notes", out);
    return out.status === "saved" || out.status === "not_found" ? { status: "saved" } : { status: "failed" };
  },
};
