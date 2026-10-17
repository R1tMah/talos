// An in-memory stand-in for the Supabase client, enough for the agent code:
// table reads with the filters it uses, and rpc calls that are recorded and
// answered by per-test handlers (or a generic "saved" reply).

import type { Ctx, Db, LibFood, SavedMeal } from "@/lib/agent/tools";

type Row = Record<string, unknown>;
type Handler = (args: Record<string, unknown>) => unknown;

export interface FakeDb {
  db: Db;
  /** Every rpc call, in order. */
  rpcs: { fn: string; args: Record<string, unknown> }[];
  /** Write rpcs only (lookups like lc_lookup excluded). */
  writes: () => { fn: string; args: Record<string, unknown> }[];
}

const READ_RPCS = new Set(["lc_lookup", "targets_for", "is_owner", "leetcode_counts"]);

function query(rows: Row[]) {
  let out = [...rows];
  const b: Record<string, unknown> = {};
  const chain = (fn: (xs: Row[]) => Row[]) => {
    out = fn(out);
    return b;
  };
  const like = (v: unknown, pattern: string) =>
    new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i").test(String(v ?? ""));
  Object.assign(b, {
    select: () => b,
    eq: (c: string, v: unknown) => chain((xs) => xs.filter((r) => r[c] === v)),
    neq: (c: string, v: unknown) => chain((xs) => xs.filter((r) => r[c] !== v)),
    is: (c: string, v: unknown) => chain((xs) => xs.filter((r) => (v === null ? r[c] == null : r[c] === v))),
    lt: (c: string, v: string) => chain((xs) => xs.filter((r) => String(r[c]) < v)),
    lte: (c: string, v: string) => chain((xs) => xs.filter((r) => String(r[c]) <= v)),
    gt: (c: string, v: string) => chain((xs) => xs.filter((r) => String(r[c]) > v)),
    gte: (c: string, v: string) => chain((xs) => xs.filter((r) => String(r[c]) >= v)),
    in: (c: string, vs: unknown[]) => chain((xs) => xs.filter((r) => vs.includes(r[c]))),
    ilike: (c: string, p: string) => chain((xs) => xs.filter((r) => like(r[c], p))),
    order: (c: string, o?: { ascending?: boolean }) =>
      chain((xs) => [...xs].sort((a, z) => (String(a[c]) < String(z[c]) ? -1 : String(a[c]) > String(z[c]) ? 1 : 0) * (o?.ascending === false ? -1 : 1))),
    limit: (n: number) => chain((xs) => xs.slice(0, n)),
    single: () => ({ then: (r: (v: unknown) => void) => r(out[0] ? { data: out[0], error: null } : { data: null, error: { message: "no rows" } }) }),
    maybeSingle: () => ({ then: (r: (v: unknown) => void) => r({ data: out[0] ?? null, error: null }) }),
    then: (r: (v: unknown) => void) => r({ data: out, error: null, count: out.length }),
  });
  return b;
}

/** A plausible saved row echoed back for a write rpc: its args without the p_ prefix. */
function echo(fn: string, args: Record<string, unknown>): Row {
  const row: Row = Object.fromEntries(Object.entries(args).map(([k, v]) => [k.replace(/^p_/, ""), v]));
  row.id = `${fn}-row`;
  if ("p_date" in args) row.logical_date = args.p_date;
  if (fn === "log_food") row.source = args.p_source ?? "typed";
  return row;
}

export function fakeDb(opts: { tables?: Record<string, Row[]>; rpc?: Record<string, Handler> } = {}): FakeDb {
  const rpcs: FakeDb["rpcs"] = [];
  let n = 0;
  const db = {
    from: (t: string) => query(opts.tables?.[t] ?? []),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ fn, args });
      if (opts.rpc?.[fn]) return { data: opts.rpc[fn](args), error: null };
      if (fn === "lc_lookup") return { data: [], error: null };
      return { data: { status: "saved", row: echo(fn, args), action_id: `act-${++n}` }, error: null };
    },
  } as unknown as Db;
  return { db, rpcs, writes: () => rpcs.filter((r) => !READ_RPCS.has(r.fn)) };
}

// ---- A small, realistic library ------------------------------------------------------

export const FOODS: LibFood[] = [
  { id: "f-guac", name: "Chipotle Guacamole", aliases: ["guac", "guacamole"], unit: "serving" },
  { id: "f-chicken", name: "Chipotle Chicken", aliases: ["chicken"], unit: "serving" },
  { id: "f-tortilla", name: "Chipotle Side Tortilla", aliases: ["side tortilla", "tortilla"], unit: "serving" },
  { id: "f-banana", name: "Banana", aliases: ["banana"], unit: "serving" },
];

export const MEALS: SavedMeal[] = [
  { id: "m-weekday", name: "Weekday breakfast", aliases: ["weekday breakfast"], unit: "serving", items: [] },
  { id: "m-bowl", name: "Chipotle Bowl", aliases: ["chipotle bowl"], unit: "bowl", items: [{ foodId: "f-chicken", servings: 2 }, { foodId: "f-guac", servings: 1 }] },
  { id: "m-protein", name: "Protein Maximized Chipotle Bowl", aliases: ["protein max bowl", "protein bowl"], unit: "serving", items: [] },
  { id: "m-flat", name: "Homemade Flatbread Chicken", aliases: ["flatbread", "flatbread dinner"], unit: "serving", items: [] },
];

export const TODAY = "2026-10-11";

/** Agent context with the library above. */
export function ctxFor(text: string, db: Db, over: Partial<Ctx> = {}): Ctx {
  return { db, text, today: TODAY, meals: MEALS, foods: FOODS, ...over };
}

/** A proposal store that records what would be saved for later confirmation. */
export function proposals() {
  const stored = new Map<string, { tool: string; resolved: Record<string, unknown>; option: boolean }>();
  let n = 0;
  return {
    stored,
    propose: async (tool: string, resolved: Record<string, unknown>, option = false) => {
      const id = `p${++n}`;
      stored.set(id, { tool, resolved, option });
      return id;
    },
  };
}
