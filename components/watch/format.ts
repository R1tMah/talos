// Display helpers for Watch. Times show in the phone's timezone unless a source has its own.

const WMO: [number[], string][] = [
  [[0], "Clear"], [[1], "Mostly clear"], [[2], "Partly cloudy"], [[3], "Cloudy"], [[45, 48], "Fog"],
  [[51, 53, 55, 56, 57], "Drizzle"], [[61, 63, 80, 81], "Rain"], [[65, 82], "Heavy rain"], [[66, 67], "Freezing rain"],
  [[71, 73, 75, 77, 85, 86], "Snow"], [[95, 96, 99], "Thunderstorms"],
];

/** Open-Meteo's WMO weather code as a word or two. */
export const sky = (code: number) => WMO.find(([codes]) => codes.includes(code))?.[1] ?? "–";

export const deg = (t: number) => `${Math.round(t)}°`;

export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Fri 10:00 PM" */
export const dayClock = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** "Oct 21" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "just now", "12 min ago", "3 h ago", "Oct 21" */
export function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return shortDate(iso);
}

/** The current hour in a timezone, in Open-Meteo's local format: "2026-10-23T14:00". */
export function localHour(tz: string, now = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

/** "2 PM" from "2026-10-23T14:00" (already local; no timezone math). */
export const hourLabel = (local: string) => {
  const h = Number(local.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

/** "7:06 AM" from "2026-10-23T07:06". */
export const localClock = (local: string) => {
  const h = Number(local.slice(11, 13));
  return `${h % 12 || 12}:${local.slice(14, 16)} ${h < 12 ? "AM" : "PM"}`;
};

export const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
