// Settings > API usage: cost from the token counts the API returned.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { callCost, fmtUsd, totals, type UsageRow } from "@/lib/apiUsage";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  created_at: "2026-10-23T12:00:00Z", model: "claude-haiku-5-5",
  input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...over,
});

describe("cost of a call", () => {
  it("prices input and output per million tokens", () => {
    // 3,000 in x $0.10/M + 200 out x $0.50/M
    expect(callCost(row({ input_tokens: 3000, output_tokens: 200 }))).toBeCloseTo(0.0004, 10);
  });
  it("cache writes are 1.25x input, cache reads 0.1x", () => {
    expect(callCost(row({ cache_creation_input_tokens: 50_000 }))).toBeCloseTo((50_000 * 0.1 * 1.25) / 1e6, 10);
    expect(callCost(row({ cache_read_input_tokens: 50_000 }))).toBeCloseTo((50_000 * 0.1 * 0.1) / 1e6, 10);
  });
  it("prompts over 100K tokens use the long-context rates", () => {
    expect(callCost(row({ input_tokens: 200_000, output_tokens: 1000 }))).toBeCloseTo(0.1 + 0.0025);
  });
  it("a model with no listed price is null, not $0", () => {
    expect(callCost(row({ model: "claude-unknown", input_tokens: 10 }))).toBeNull();
  });
});

describe("totals", () => {
  it("adds calls up per model", () => {
    const [t] = totals([row({ input_tokens: 1000, output_tokens: 100 }), row({ input_tokens: 2000, output_tokens: 300 })]);
    expect(t).toMatchObject({ model: "claude-haiku-5-5", calls: 2, input: 3000, output: 400 });
    expect(t.cost).toBeCloseTo((3000 * 0.1 + 400 * 0.5) / 1e6, 10);
  });
});

it("formats small amounts readably", () => {
  expect(fmtUsd(0)).toBe("$0.00");
  expect(fmtUsd(0.00042)).toBe("$0.0004");
  expect(fmtUsd(1.374)).toBe("$1.37");
});
