import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { CHESS_USERNAME, CLASSES, parseMonths, trimGame, type ApiGame, type ChessClass, type ChessData, type ClassStats } from "@/lib/chess";

const API = "https://api.chess.com/pub/player";
const TIMEOUT_MS = 10_000;
const FRESH_MS = 60_000; // chess.com updates within minutes; a refresh every minute is plenty

// chess.com asks API clients to identify themselves.
const HEADERS = { "User-Agent": "TALOS personal tracker", Accept: "application/json" };

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`chess.com returned ${status}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

/**
 * A month's games. A month with no games is a 404 (or an empty list): no games. Any other
 * failure (rate limit, 5xx, timeout) is tried once more, then fails the whole response, so
 * a month that's merely unreachable is never shown, or cached, as a month without games.
 */
async function getArchive(url: string): Promise<Archive> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJson<Archive>(url);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return { games: [] };
      if (attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/** "2026/11" for this month (UTC, like chess.com's archives) and `back` months before. */
function monthPath(back: number, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type ApiStats = Partial<Record<`chess_${ChessClass}`, { last?: { rating: number }; best?: { rating: number }; record?: ClassStats["record"] }>>;
type Archive = { games: ApiGame[] };

/** One entry per month count asked for (`?months=`), each fresh for a minute. */
const cache = new Map<number, { at: number; data: ChessData }>();

/**
 * The owner's chess.com ratings and the games in the last `?months=` monthly archives:
 * 2 by default (this month and last, so a day's rating change has the rating it started
 * from), up to 24 for looking back. Read only; nothing is stored.
 */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const force = params.has("refresh");
  const months = parseMonths(params.get("months"));
  const hit = cache.get(months);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return NextResponse.json(hit.data);

  const user = CHESS_USERNAME.toLowerCase();
  const now = new Date();
  try {
    const [stats, ...archives] = await Promise.all([
      getJson<ApiStats>(`${API}/${user}/stats`),
      ...Array.from({ length: months }, (_, back) => getArchive(`${API}/${user}/games/${monthPath(back, now)}`)),
    ]);
    const data: ChessData = {
      username: CHESS_USERNAME,
      stats: Object.fromEntries(
        CLASSES.map(({ key }) => {
          const s = (stats as ApiStats)[`chess_${key}`];
          return [key, { rating: s?.last?.rating ?? null, best: s?.best?.rating ?? null, record: s?.record ?? null }];
        }),
      ) as Record<ChessClass, ClassStats>,
      games: (archives as Archive[])
        .flatMap((a) => a.games ?? [])
        .map((g) => trimGame(g))
        .filter((g) => g !== null)
        .sort((a, b) => a.end - b.end),
      months,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(months, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[chess] ${String((e as Error).message ?? e).slice(0, 200)}`);
    // Stale is better than nothing when chess.com is briefly down.
    if (hit) return NextResponse.json(hit.data);
    return NextResponse.json({ error: "Couldn't reach chess.com" }, { status: 502 });
  }
}
