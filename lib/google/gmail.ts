// Sending mail from the owner's Gmail, to themselves (the weekly email). Server-side
// only. Uses the same Google sign-in as the calendar, with the gmail.send scope:
// Talos can send, never read.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { accessToken } from "./calendar";

type Admin = SupabaseClient<Database>;

const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Thrown when the Google connection predates email: the owner reconnects once. */
export class NeedsMailAccess extends Error {
  constructor() {
    super("Reconnect Google to allow sending the weekly email.");
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
/** A header value that may hold non-ASCII ("Week of Oct 19 · 3 reminders"). */
const encodedWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const lines76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

/** The RFC 2822 message: plain text and HTML alternatives, both base64. Pure, for tests. */
export function mimeMessage(to: string, subject: string, text: string, html: string): string {
  const boundary = `talos-${Math.random().toString(36).slice(2)}`;
  return [
    `To: ${to}`,
    `From: TALOS <${to}>`,
    `Subject: ${encodedWord(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines76(b64(text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines76(b64(html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Sends one email from the connected account to that same account. */
export async function sendToSelf(admin: Admin, subject: string, text: string, html: string): Promise<void> {
  const { data } = await admin.from("google_auth").select("email").eq("id", 1).maybeSingle();
  if (!data?.email) throw new Error("Google isn't connected. Connect it from a Watch calendar's settings.");
  const raw = Buffer.from(mimeMessage(data.email, subject, text, html), "utf8").toString("base64url");
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken(admin)}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403) {
    const why = (await res.json().catch(() => ({}))) as { error?: { details?: { reason?: string }[]; errors?: { reason?: string }[] } };
    const reasons = [...(why.error?.details ?? []), ...(why.error?.errors ?? [])].map((d) => d.reason);
    if (reasons.some((r) => r === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || r === "insufficientPermissions")) throw new NeedsMailAccess();
  }
  if (!res.ok) throw new Error(`Gmail returned ${res.status}`);
}
