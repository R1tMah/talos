import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { fetchTransit } from "@/lib/watch/adapters";
import type { TransitConfig } from "@/lib/watch/types";

/**
 * Live departures for a transit source: GET ?id=<source>&flip=1. Not stored; the MBTA
 * answer is cached for the source's cache_seconds so an open card polling every few
 * seconds stays well inside the API's rate limit.
 */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: source } = await db.from("watch_sources").select("kind, config").eq("id", id).maybeSingle();
  if (!source || source.kind !== "transit") return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const snap = await fetchTransit(source.config as unknown as TransitConfig, url.searchParams.get("flip") === "1");
    return NextResponse.json(snap);
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 });
  }
}
