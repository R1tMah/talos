import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { fetchRoster } from "@/lib/watch/adapters";

const SLUG = /^[a-z0-9.-]{1,24}$/;

/** A team's roster names for the Team source's player picker: GET ?sport=basketball&league=nba&team=por. */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const [sport, league, team] = ["sport", "league", "team"].map((k) => (q.get(k) ?? "").toLowerCase());
  if (![sport, league, team].every((v) => SLUG.test(v))) return NextResponse.json({ error: "bad team" }, { status: 400 });
  try {
    const roster = await fetchRoster({ sport, league, team });
    return NextResponse.json({ players: roster.athletes.map((a) => a.displayName) });
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 });
  }
}
