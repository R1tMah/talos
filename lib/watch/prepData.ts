"use client";

// System Design Prep data: the curriculum (static JSON, ~200 KB, loaded only when a prep
// card is on screen) and which sessions are marked done (one row per session).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Curriculum } from "./prep";

let cached: Curriculum | null = null;

/** The curriculum, or null while it loads. */
export function useCurriculum() {
  const [c, setC] = useState<Curriculum | null>(cached);
  useEffect(() => {
    if (cached) return;
    import("./sysdesign-curriculum.json").then((m) => setC((cached = m.default as unknown as Curriculum)));
  }, []);
  return c;
}

/** Sessions marked done for a curriculum, and a toggle. A failed write leaves the state as it was. */
export function usePrepDone(curriculumId: string | undefined) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());

  const reload = useCallback(async () => {
    if (!curriculumId) return;
    const { data, error } = await createClient().from("prep_completions").select("session").eq("curriculum_id", curriculumId);
    if (!error) setDone(new Set(data.map((r) => r.session)));
  }, [curriculumId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = async (session: number) => {
    if (!curriculumId) return;
    const db = createClient();
    const res = done.has(session)
      ? await db.from("prep_completions").delete().eq("curriculum_id", curriculumId).eq("session", session)
      : await db.from("prep_completions").insert({ curriculum_id: curriculumId, session });
    if (!res.error) await reload();
  };

  return { done, toggle };
}

/** The System Design Prep source on Watch (its id and start date), or null if there's none. */
export function usePrepSource() {
  const [src, setSrc] = useState<{ id: string; start: string } | null>(null);
  useEffect(() => {
    createClient().from("watch_sources").select("id, config").eq("kind", "prep").limit(1).maybeSingle()
      .then(({ data }) => data && setSrc({ id: data.id, start: (data.config as { start?: string } | null)?.start ?? "" }));
  }, []);
  return src;
}
