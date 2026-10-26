// The portfolio site's editor API (https://<site>/admin/api), server-side only. Content is
// three JSON files in the site's repo; a save is validated by the API, committed to GitHub
// and live after the Netlify rebuild (~1–2 min). Saves replace the whole file, so every
// change is read → change → save, retried when someone else saved in between (409).
//
// Needs PORTFOLIO_BASE_URL, PORTFOLIO_ADMIN_USERNAME (or PORTFOLIO_ADMIN_USER), PORTFOLIO_ADMIN_PASSWORD.

import type { FileName } from "./types";

export class PortfolioValidationError extends Error {
  constructor(public errors: string[]) {
    super(`The portfolio rejected the change:\n- ${errors.join("\n- ")}`);
  }
}

/** The editor login's username: PORTFOLIO_ADMIN_USERNAME (matching Netlify's ADMIN_USERNAME), or PORTFOLIO_ADMIN_USER. */
const adminUser = () => process.env.PORTFOLIO_ADMIN_USERNAME || process.env.PORTFOLIO_ADMIN_USER;

export const portfolioConfigured = () =>
  Boolean(process.env.PORTFOLIO_BASE_URL && adminUser() && process.env.PORTFOLIO_ADMIN_PASSWORD);

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!portfolioConfigured()) throw new Error("Portfolio isn't set up on the server (PORTFOLIO_BASE_URL, PORTFOLIO_ADMIN_USERNAME, PORTFOLIO_ADMIN_PASSWORD).");
  const auth = "Basic " + Buffer.from(`${adminUser()}:${process.env.PORTFOLIO_ADMIN_PASSWORD}`).toString("base64");
  const res = await fetch(`${process.env.PORTFOLIO_BASE_URL!.replace(/\/$/, "")}/admin/api/${path}`, {
    ...init,
    headers: { Authorization: auth, ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) throw new Error("The portfolio refused the login. Check PORTFOLIO_ADMIN_USERNAME and PORTFOLIO_ADMIN_PASSWORD.");
  return { status: res.status, body };
}

/** Latest committed content of one file (newer than the live site while a build runs). */
export async function getContent<T>(file: FileName): Promise<{ items: T[]; version: string }> {
  const { status, body } = await call(file);
  if (status !== 200) throw new Error(`Couldn't read ${file} (${status}${body.error ? `: ${body.error}` : ""}).`);
  return body as unknown as { items: T[]; version: string };
}

/** Read → change → save. `change` gets a copy of the current items and returns the full new array. */
export async function updateContent<T>(file: FileName, change: (items: T[]) => T[], attempts = 3): Promise<{ version: string }> {
  for (let i = 1; i <= attempts; i++) {
    const { items, version } = await getContent<T>(file);
    const next = change(structuredClone(items));
    const { status, body } = await call(file, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next, version }),
    });
    if (status === 200) return { version: String(body.version) };
    if (status === 422) throw new PortfolioValidationError((body.errors as string[] | undefined) ?? [String(body.error)]);
    if (status !== 409) throw new Error(`Couldn't save ${file} (${status}${body.error ? `: ${body.error}` : ""}).`);
    // 409: changed since we read it; read again and re-apply.
  }
  throw new Error(`${file} kept changing while saving; try again.`);
}

/** Uploads image bytes to the site's assets; returns the path to use as a card's logo. */
export async function uploadImage(fileName: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const { status, body } = await call(`upload?name=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (status !== 200) throw new Error(`Upload failed (${status}${body.error ? `: ${body.error}` : ""}).`);
  return String(body.path);
}
