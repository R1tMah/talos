// Run durations: shared by the Runs screen (client) and the chat agent (server).

/** 1650 -> "27:30", 3725 -> "1:02:05". */
export function fmtDuration(totalSec: number) {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "27:30", "1:02:05", "27", "27 min", "1h 5m" -> seconds. Null when unreadable. */
export function parseDuration(t: string): number | null {
  const s = t.trim().toLowerCase();
  let m = s.match(/^(\d+):(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = s.match(/^(\d+):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?|s)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?|s)?)?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Math.round(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  m = s.match(/^(\d+(?:\.\d+)?)$/); // bare number = minutes
  return m ? Math.round(Number(m[1]) * 60) : null;
}
