// The owner's Gmail, server-side only, through the same Google sign-in as the calendar:
// sending to themselves (the weekly email, future letters; gmail.send) and, for Inbox
// updates, reading (gmail.readonly: it can't change, label or delete anything).

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

// ---- Reading (Inbox updates) -----------------------------------------------------------

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Thrown when the Google connection can't read mail yet: the owner reconnects once. */
export class NeedsReadAccess extends Error {
  constructor() {
    super("Reconnect Google to let Talos read your inbox for application updates.");
  }
}

async function gmailGet<T>(admin: Admin, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${await accessToken(admin)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403) throw new NeedsReadAccess();
  if (!res.ok) throw new Error(`Gmail returned ${res.status}`);
  return res.json() as Promise<T>;
}

/** Message ids matching a Gmail search, newest first (at most `max`). */
export async function searchMail(admin: Admin, q: string, max = 50): Promise<string[]> {
  const out = await gmailGet<{ messages?: { id: string }[] }>(admin, `/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
  return (out.messages ?? []).map((m) => m.id);
}

interface Part {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
}

export interface MailMessage {
  id: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
}

const fromB64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** HTML as readable text: blocks become line breaks, tags and styles go, entities decode. */
export function htmlText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

/** The message's text: its plain-text part, or its HTML part as text. Pure, for tests. */
export function bodyText(payload: Part): string {
  const flat: Part[] = [];
  const walk = (p: Part) => {
    flat.push(p);
    p.parts?.forEach(walk);
  };
  walk(payload);
  const plain = flat.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) return fromB64(plain.body!.data!).trim();
  const html = flat.find((p) => p.mimeType === "text/html" && p.body?.data);
  return html ? htmlText(fromB64(html.body!.data!)) : "";
}

/** One message: subject, sender, when it arrived, and its text. */
export async function readMail(admin: Admin, id: string): Promise<MailMessage> {
  const m = await gmailGet<{ id: string; internalDate: string; payload: Part }>(admin, `/messages/${id}?format=full`);
  const header = (name: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return { id: m.id, subject: header("subject"), from: header("from"), date: new Date(Number(m.internalDate)), text: bodyText(m.payload) };
}
