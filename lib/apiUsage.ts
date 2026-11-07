"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Anthropic first-party prices, $ per million tokens (checked 2026-10-23). Update here when they
// change. Prompts over `longAbove` input tokens are billed at the `long` rates. Cache writes are
// 1.25x and cache reads 0.1x the input rate (the app doesn't use prompt caching today).
export const PRICES: Record<string, { input: number; output: number; longAbove?: number; long?: { input: number; output: number } }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longAbove: 100_000, long: { input: 0.5, output: 2.5 } },
  // Learning's Architect (lib/learning/architect.ts).
  "claude-sonnet-5-5": { input: 2, output: 10 },
  // Behavioral mocks, when Opus is picked for a role in Settings.
  "claude-opus-5-5": { input: 4, output: 20 },
};
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export interface UsageRow {
  created_at: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ModelTotal {
  model: string;
  calls: number;
  input: number; // uncached input tokens
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Null when the model has no price in PRICES. */
  cost: number | null;
}

/** One call's cost in dollars, or null for a model with no listed price. */
export function callCost(r: UsageRow): number | null {
  const p = PRICES[r.model];
  if (!p) return null;
  const prompt = r.input_tokens + r.cache_creation_input_tokens + r.cache_read_input_tokens;
  const rate = p.long && p.longAbove != null && prompt > p.longAbove ? p.long : p;
  return (
    (r.input_tokens * rate.input +
      r.cache_creation_input_tokens * rate.input * CACHE_WRITE +
      r.cache_read_input_tokens * rate.input * CACHE_READ +
      r.output_tokens * rate.output) /
    1_000_000
  );
}

/** Per-model totals, most expensive first. */
export function totals(rows: UsageRow[]): ModelTotal[] {
  const by = new Map<string, ModelTotal>();
  for (const r of rows) {
    const t = by.get(r.model) ?? { model: r.model, calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
    t.calls++;
    t.input += r.input_tokens;
    t.output += r.output_tokens;
    t.cacheWrite += r.cache_creation_input_tokens;
    t.cacheRead += r.cache_read_input_tokens;
    const c = callCost(r);
    t.cost = c == null || t.cost == null ? null : t.cost + c;
    by.set(r.model, t);
  }
  return [...by.values()].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}

/** "$0.0042", "$1.37": small amounts keep enough digits to be readable. */
export const fmtUsd = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** Logged calls since `since` (ISO timestamp), or all of them. */
export function useApiUsage(since: string | null) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    let q = createClient()
      .from("api_usage")
      .select("created_at, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens")
      .order("created_at", { ascending: false });
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows(data);
  }, [since]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, failed, reload };
}
