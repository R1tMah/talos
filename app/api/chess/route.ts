import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { CHESS_USERNAME, CLASSES, trimGame, type ApiGame, type ChessClass, type ChessData, type ClassStats } from "@/lib/chess";

const API = "https://api.chess.com/pub/player";
const TIMEOUT_MS = 10_000;
const FRESH_MS = 60_000; // chess.com updates within minutes; a refresh every minute is plenty

// chess.com asks API clients to identify themselves.
const HEADERS = { "User-Agent": "TALOS personal tracker", Accept: "application/json" };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`chess.com returned ${res.status}`);
  return res.json() as Promise<T>;
}

/** "2026/11" for this month (UTC, like chess.com's archives) and `back` months before. */
function monthPath(back: number, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type ApiStats = Partial<Record<`chess_${ChessClass}`, { last?: { rating: number }; best?: { rating: number }; record?: ClassStats["record"] }>>;

let cache: { at: number; data: ChessData } | null = null;

/**
 * The owner's chess.com ratings and this month's and last month's games (last month so
 * a day's rating change has the rating it started from). Read only; nothing is stored.
 */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.has("refresh");
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return NextResponse.json(cache.data);

  const user = CHESS_USERNAME.toLowerCase();
  try {
    const [stats, thisMonth, lastMonth] = await Promise.all([
      getJson<ApiStats>(`${API}/${user}/stats`),
      getJson<{ games: ApiGame[] }>(`${API}/${user}/games/${monthPath(0)}`),
      // A month with no games is a 404 or an empty list; either way, no games.
      getJson<{ games: ApiGame[] }>(`${API}/${user}/games/${monthPath(1)}`).catch(() => ({ games: [] })),
    ]);
    const data: ChessData = {
      username: CHESS_USERNAME,
      stats: Object.fromEntries(
        CLASSES.map(({ key }) => {
          const s = stats[`chess_${key}`];
          return [key, { rating: s?.last?.rating ?? null, best: s?.best?.rating ?? null, record: s?.record ?? null }];
        }),
      ) as Record<ChessClass, ClassStats>,
      games: [...(lastMonth.games ?? []), ...(thisMonth.games ?? [])]
        .map((g) => trimGame(g))
        .filter((g) => g !== null)
        .sort((a, b) => a.end - b.end),
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[chess] ${String((e as Error).message ?? e).slice(0, 200)}`);
    // Stale is better than nothing when chess.com is briefly down.
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json({ error: "Couldn't reach chess.com" }, { status: 502 });
  }
}
