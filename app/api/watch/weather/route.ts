import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/agent/server";
import { fetchWeather, searchPlaces } from "@/lib/watch/adapters";

/**
 * Weather anywhere, for the weather page's search. Not stored.
 *   GET ?q=<text>[&lat=&lon=]        places matching it, nearest to lat/lon first
 *   GET ?lat=&lon=&place=<name>      that place's forecast, in its own timezone
 */
export async function GET(req: Request) {
  const db = await ownerDb();
  if (!db) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  try {
    const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
    const at = !!url.searchParams.get("lat") && !!url.searchParams.get("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const q = url.searchParams.get("q")?.trim();
    if (q) return NextResponse.json({ places: await searchPlaces(q.slice(0, 200), at ? { lat, lon } : undefined) });

    if (!at) {
      return NextResponse.json({ error: "q, or lat and lon, required" }, { status: 400 });
    }
    const place = url.searchParams.get("place")?.slice(0, 200) || `${lat}, ${lon}`;
    return NextResponse.json(await fetchWeather({ place, lat, lon, timezone: "auto" }));
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 });
  }
}
