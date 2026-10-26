// The scheduled jobs (pg_cron -> net.http_post) call the app with no session, sending
// Bearer WATCH_CRON_SECRET instead. Routes they reach let them through only on this check.

import { timingSafeEqual } from "node:crypto";

/** True when the request carries the cron secret. */
export function fromCron(req: Request) {
  const secret = process.env.WATCH_CRON_SECRET;
  const sent = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !sent) return false;
  const a = Buffer.from(sent), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
