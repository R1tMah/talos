"use client";

// Future Letters, read and written as the owner. The database won't hand a sealed
// letter's body to this role at all (migration 20261107110000): sealed letters are read
// as metadata only, and bodies come back only through opened_letters().

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface SealedLetter {
  id: string;
  createdAt: string;
  writtenAt: string;
  deliverAt: string;
}

export interface OpenedLetter {
  id: string;
  writtenAt: string;
  openedAt: string;
  emailedAt: string | null;
  emailError: string | null;
  body: string;
}

export function useLetters() {
  const [sealed, setSealed] = useState<SealedLetter[] | null>(null);
  const [opened, setOpened] = useState<OpenedLetter[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const db = createClient();
    // Opened first: it opens any letter that just came due, so it isn't also listed as sealed.
    const o = await db.rpc("opened_letters");
    // No body column here, on purpose.
    const s = await db.from("future_letters").select("id, created_at, written_at, deliver_at").is("opened_at", null).order("deliver_at");
    if (o.error || s.error) return setFailed(true);
    setFailed(false);
    setOpened(o.data.map((r) => ({
      id: r.id, writtenAt: r.written_at, openedAt: r.opened_at, emailedAt: r.emailed_at, emailError: r.email_error, body: r.body,
    })));
    setSealed(s.data.map((r) => ({ id: r.id, createdAt: r.created_at, writtenAt: r.written_at, deliverAt: r.deliver_at })));
  }, []);

  useEffect(() => {
    load();
    // A letter that unlocks while the app is in the background opens on return.
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  return { sealed, opened, failed, reload: load };
}

export const lettersApi = {
  /** Seals a letter. Only its id comes back; the body is never read. */
  async seal(body: string, deliverAt: Date, writtenAt: Date): Promise<string | null> {
    const { error } = await createClient().from("future_letters")
      .insert({ body, deliver_at: deliverAt.toISOString(), written_at: writtenAt.toISOString() });
    return error ? (error.message.includes("future") ? error.message : "Couldn't seal the letter.") : null;
  },
  async postpone(id: string, deliverAt: Date): Promise<string | null> {
    const { error } = await createClient().from("future_letters").update({ deliver_at: deliverAt.toISOString() }).eq("id", id);
    return error ? (error.message.includes("postponed") ? error.message : "Couldn't change the date.") : null;
  },
  async remove(id: string): Promise<boolean> {
    const { error } = await createClient().from("future_letters").delete().eq("id", id);
    return !error;
  },
};
