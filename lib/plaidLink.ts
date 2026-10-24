"use client";

// Opens Plaid Link (Plaid's bank sign-in window) from its official script. Banks that
// use OAuth (PNC) leave the app for their own login and come back to /finances with
// ?oauth_state_id=…; resumeOAuth() reopens Link with the same token to finish.

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const TOKEN_KEY = "talos-plaid-link"; // the link token + what it's for, kept across the OAuth round trip

export interface LinkSuccess {
  publicToken: string;
  institution: string | null;
}

interface PlaidHandler {
  open: () => void;
  destroy: () => void;
}
declare global {
  interface Window {
    Plaid?: {
      create: (opts: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
        onExit: (err: unknown) => void;
      }) => PlaidHandler;
    };
  }
}

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.Plaid) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Plaid Link failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface Pending<T> {
  token: string;
  context: T;
}

/** Opens Link. Resolves with the result, or null if the owner closed it. */
export async function openLink<T>(token: string, context: T, receivedRedirectUri?: string): Promise<LinkSuccess | null> {
  await loadScript();
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, context } satisfies Pending<T>));
  } catch {}
  return new Promise((resolve) => {
    const handler = window.Plaid!.create({
      token,
      receivedRedirectUri,
      onSuccess: (publicToken, metadata) => {
        handler.destroy();
        resolve({ publicToken, institution: metadata.institution?.name ?? null });
      },
      onExit: () => {
        handler.destroy();
        resolve(null);
      },
    });
    handler.open();
  });
}

/** After an OAuth bank sends the owner back: the Link token and context to resume with, if any. */
export function pendingOAuth<T>(): Pending<T> | null {
  if (!new URLSearchParams(window.location.search).has("oauth_state_id")) return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
    return v?.token ? v : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}
