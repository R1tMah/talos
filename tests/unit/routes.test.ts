// /api/confirm and /api/chat with the session and database faked (#115-#119,
// #128, #144, #149). The real tool registry runs underneath.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, run: vi.fn() }));

vi.mock("@/lib/agent/server", () => ({
  ownerDb: async () => state.db,
  loadCtx: async (db: unknown, text: string) => ({ threshold: 0.85, ctx: { db, text, today: "2026-10-11", meals: [], foods: [] } }),
  proposer: () => async () => "p-follow-up",
}));
vi.mock("@/lib/agent/run", async (orig) => ({ ...(await orig<typeof import("@/lib/agent/run")>()), run: state.run }));

import { POST as chat } from "@/app/api/chat/route";
import { POST as confirm } from "@/app/api/confirm/route";

type Row = Record<string, unknown>;

/** A tiny table store with the query shapes the two routes use. */
function store(tables: Record<string, Row[]>) {
  const rpcs: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const rows = (tables[t] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    let head = false;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const finish = () => {
      if (inserted) return { data: inserted, error: null };
      if (patch) {
        const hit = matching();
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit[0] ?? null, error: null };
      }
      return { data: head ? null : matching(), error: null, count: matching().length };
    };
    const b: Row = {
      select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), b),
      update: (p: Row) => ((patch = p), b),
      insert: (row: Row) => {
        if (t === "message_log" && rows.some((r) => r.client_msg_id === row.client_msg_id)) {
          inserted = null;
          return { select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) };
        }
        inserted = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), ...row };
        rows.push(inserted);
        return b;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), b),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
      single: async () => finish(),
      maybeSingle: async () => {
        const out = finish();
        return { ...out, data: Array.isArray(out.data) ? (out.data[0] ?? null) : out.data };
      },
      then: (r: (v: unknown) => void) => r(finish()),
    };
    return b;
  };
  const rpc = async (fn: string, args: Row) => {
    rpcs.push({ fn, args });
    return { data: { status: "saved", row: { logical_date: args.p_date, weight_lb: args.p_weight_lb, description: args.p_description, calories: args.p_calories, protein_g: args.p_protein_g }, action_id: `act-${rpcs.length}` }, error: null };
  };
  return { db: { from, rpc }, tables, rpcs };
}

const post = (body: unknown) => new Request("http://test/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();

describe("15. /api/confirm", () => {
  let s: ReturnType<typeof store>;
  beforeEach(() => {
    s = store({
      pending_proposals: [
        { id: "p-weight", tool: "log_weight", args: { date: "2026-10-11", weight_lb: 168.2, note: null, _option: false }, message_id: "m1", used_at: null, expires_at: future },
        { id: "p-old", tool: "log_weight", args: { date: "2026-10-11", weight_lb: 168.2, note: null }, message_id: "m1", used_at: null, expires_at: past },
        { id: "p-food", tool: "log_food", args: { mode: "typed", date: "2026-10-11", description: "chicken bowl", calories: null, protein_g: null, carbs_g: null, fat_g: null }, message_id: "m2", used_at: null, expires_at: future },
        { id: "p-pick", tool: "log_weight", args: { date: "2026-10-11", weight_lb: 170, note: null, _option: true }, message_id: "m3", used_at: null, expires_at: future },
      ],
      message_log: [{ id: "m3", corrected: false }],
    });
    state.db = s.db;
  });

  it("#115 confirming a pending proposal commits it once", async () => {
    const res = await (await confirm(post({ proposalId: "p-weight" }))).json();
    expect(res.cards[0].kind).toBe("saved");
    expect(s.rpcs.map((r) => r.fn)).toEqual(["save_weight"]);
  });

  it("#116 confirming the same proposal twice commits only once", async () => {
    await confirm(post({ proposalId: "p-weight" }));
    const second = await (await confirm(post({ proposalId: "p-weight" }))).json();
    expect(second.cards[0].kind).toBe("failed");
    expect(s.rpcs).toHaveLength(1);
  });

  it("#117 an expired proposal returns an error and writes nothing", async () => {
    const res = await (await confirm(post({ proposalId: "p-old" }))).json();
    expect(res.cards[0]).toMatchObject({ kind: "failed" });
    expect(s.rpcs).toEqual([]);
  });

  it("#118 an unknown or tampered proposal id is rejected", async () => {
    expect((await (await confirm(post({ proposalId: "not-a-proposal" }))).json()).cards[0].kind).toBe("failed");
    expect((await confirm(post({ proposalId: { id: "p-weight" } }))).status).toBe(400);
    expect(s.rpcs).toEqual([]);
  });

  it("filling a missing-fields card commits with the given values", async () => {
    const res = await (await confirm(post({ proposalId: "p-food", values: { calories: 650, protein_g: 50 } }))).json();
    expect(res.cards[0].kind).toBe("saved");
    expect(s.rpcs[0].args).toMatchObject({ p_calories: 650, p_protein_g: 50 });
  });

  it("a bad fill value writes nothing and leaves the card usable", async () => {
    const res = await (await confirm(post({ proposalId: "p-food", values: { calories: "lots" } }))).json();
    expect(res.cards[0].kind).toBe("failed");
    expect(s.rpcs).toEqual([]);
    expect(s.tables.pending_proposals.find((p) => p.id === "p-food")!.used_at).toBeNull();
  });

  it("picking from the picker marks the message as corrected (for threshold tuning)", async () => {
    await confirm(post({ proposalId: "p-pick" }));
    expect(s.tables.message_log[0].corrected).toBe(true);
  });

  it("#144 without the owner's session it returns 401", async () => {
    state.db = null;
    expect((await confirm(post({ proposalId: "p-weight" }))).status).toBe(401);
  });
});

describe("/api/chat", () => {
  let s: ReturnType<typeof store>;
  beforeEach(() => {
    s = store({ message_log: [] });
    state.db = s.db;
    state.run.mockReset();
    state.run.mockResolvedValue({ route: "rule", calls: [], cards: [{ kind: "saved", label: "Weight 168.2 lb", actionId: "a1" }] });
  });

  it("#128 the same client_msg_id sent twice runs once and returns the same answer", async () => {
    const first = await (await chat(post({ text: "168.2", clientMsgId: "c1" }))).json();
    const second = await (await chat(post({ text: "168.2", clientMsgId: "c1" }))).json();
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("#149 a burst over the per-minute cap is refused before any model call", async () => {
    for (let i = 0; i < 20; i++) s.tables.message_log.push({ id: `old-${i}`, client_msg_id: `old-${i}`, created_at: new Date().toISOString() });
    const res = await chat(post({ text: "168.2", clientMsgId: "c-burst" }));
    expect(res.status).toBe(429);
    expect(state.run).not.toHaveBeenCalled();
  });

  it("#144 without the owner's session it returns 401", async () => {
    state.db = null;
    expect((await chat(post({ text: "168.2", clientMsgId: "c2" }))).status).toBe(401);
  });

  it("an empty or oversized message is rejected", async () => {
    expect((await chat(post({ text: "   ", clientMsgId: "c3" }))).status).toBe(400);
    expect((await chat(post({ text: "x".repeat(2001), clientMsgId: "c4" }))).status).toBe(400);
    expect(state.run).not.toHaveBeenCalled();
  });
});
