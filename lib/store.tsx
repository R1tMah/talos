"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { makeSeed, migrateBreaks, migratePlanNames } from "./seed";
import type { Coll, DB, Item } from "./types";
import { PageSkeleton } from "@/components/Skeleton";

const KEY = "talos.v1";

interface Store {
  db: DB;
  mutate: (fn: (db: DB) => DB) => void;
  add: <K extends Coll>(k: K, item: Item<K>) => void;
  update: <K extends Coll>(k: K, id: string, patch: Partial<Item<K>>) => void;
  /** Soft delete: the row stays in storage with `deleted: true`. */
  remove: (k: Coll, id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);

  useEffect(() => {
    let saved: DB | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.v === 1) saved = parsed;
    } catch {}
    setDb(saved ? migrateBreaks(migratePlanNames(saved)) : makeSeed());
  }, []);

  useEffect(() => {
    if (!db) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  }, [db]);

  const mutate = useCallback((fn: (db: DB) => DB) => setDb((d) => (d ? fn(d) : d)), []);

  const store = useMemo<Store | null>(() => {
    if (!db) return null;
    const write = (k: Coll, fn: (rows: { id: string }[]) => { id: string }[]) =>
      mutate((d) => ({ ...d, [k]: fn(d[k]) }) as DB);
    return {
      db,
      mutate,
      add: (k, item) => write(k, (rows) => [...rows, item]),
      update: (k, id, patch) => write(k, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
      remove: (k, id) => write(k, (rows) => rows.map((r) => (r.id === id ? { ...r, deleted: true } : r))),
    };
  }, [db, mutate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Renders a skeleton until the store has loaded from local storage. */
export function Ready({ children }: { children: ReactNode }) {
  return useContext(Ctx) ? children : <PageSkeleton />;
}

/** For app chrome that renders before the store is ready. */
export const useOptionalStore = () => useContext(Ctx);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function resetStore() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  location.reload();
}
