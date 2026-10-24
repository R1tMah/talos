"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDay, toISO } from "@/lib/date";
import type { Connection } from "@/lib/finances";
import { FLAGS } from "@/lib/flags";
import { plaidApi } from "@/lib/financesData";
import { clearPending, openLink, pendingOAuth } from "@/lib/plaidLink";
import { showToast } from "@/lib/undo";
import { Tag } from "./ui";

type Context = { kind: Connection["kind"] } | { id: string };

const SLOTS = ([
  { kind: "checking", label: "PNC Checking" },
  { kind: "investments", label: "Vanguard" },
] satisfies { kind: Connection["kind"]; label: string }[]).filter((s) => s.kind !== "investments" || FLAGS.vanguard);

const STATUS: Record<Connection["status"], string | null> = {
  ok: null,
  login_required: "Sign in again",
  pending_expiration: "Access expiring soon",
  error: "Sync failed",
};

function ago(iso: string | null) {
  if (!iso) return "not synced yet";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "synced just now";
  if (min < 60) return `synced ${min}m ago`;
  if (min < 24 * 60) return `synced ${Math.round(min / 60)}h ago`;
  return `synced ${fmtDay(toISO(new Date(iso)))}`;
}

/**
 * Plaid connections for Finances: connect PNC (transactions + balance) and Vanguard
 * (holdings), sync on demand, sign back in when a bank asks, or disconnect.
 */
export function PlaidConnections({ connections, onChange }: { connections: Connection[]; onChange: () => Promise<void> | void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const resumed = useRef(false);

  const fail = (text = "Failed") => showToast({ text, tone: "error" });

  /** After Link succeeds: a new bank is exchanged and stored; a sign-in fix just resyncs. */
  const finish = async (ctx: Context, publicToken: string, institution: string | null) => {
    if ("id" in ctx) {
      const r = await plaidApi.sync(ctx.id);
      if (!r?.results.every((x) => x.ok)) fail("Signed in, but the sync failed");
    } else {
      const r = await plaidApi.exchange(publicToken, ctx.kind, institution);
      if (!r) return fail("Couldn't save the connection");
      showToast({ text: r.result.ok ? `Connected ${institution ?? "bank"}` : `Connected ${institution ?? "bank"}; data still loading` });
    }
    await onChange();
  };

  const link = async (key: string, ctx: Context) => {
    setBusy(key);
    try {
      const t = await plaidApi.linkToken(ctx);
      if (!t) return fail("Couldn't start Plaid");
      const res = await openLink(t.linkToken, ctx);
      if (res) await finish(ctx, res.publicToken, res.institution);
    } catch {
      fail("Plaid didn't load");
    } finally {
      clearPending();
      setBusy(null);
    }
  };

  // Coming back from an OAuth bank's login (PNC): reopen Link with the same token to finish.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const p = pendingOAuth<Context>();
    if (!p) return;
    const redirect = window.location.href;
    window.history.replaceState(null, "", window.location.pathname);
    setBusy("oauth");
    openLink(p.token, p.context, redirect)
      .then((res) => (res ? finish(p.context, res.publicToken, res.institution) : undefined))
      .catch(() => fail("Plaid didn't load"))
      .finally(() => {
        clearPending();
        setBusy(null);
      });
    // finish/onChange are stable enough for a one-time resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = async (c: Connection) => {
    setBusy(c.id);
    const r = await plaidApi.sync(c.id);
    if (!r?.results.every((x) => x.ok)) fail("Sync failed");
    await onChange();
    setBusy(null);
  };

  const disconnect = async (c: Connection) => {
    const warn = c.env === "production"
      ? `Disconnect ${c.institution ?? "this bank"}? Its synced data is deleted, and on the free plan the connection slot isn't given back.`
      : `Disconnect ${c.institution ?? "this test bank"}? Its synced data is deleted.`;
    if (!window.confirm(warn)) return;
    setBusy(c.id);
    if (!(await plaidApi.disconnect(c.id))) fail();
    await onChange();
    setBusy(null);
  };

  return (
    <section className="card list" aria-label="Bank connections">
      {SLOTS.map(({ kind, label }) => {
        const mine = connections.filter((c) => c.kind === kind);
        if (!mine.length) {
          return (
            <div key={kind} className="row">
              <span className="row-label">{label}</span>
              <button type="button" className="btn btn-sm" disabled={busy != null} onClick={() => link(kind, { kind })}>
                {busy === kind ? "Connecting…" : "Connect"}
              </button>
            </div>
          );
        }
        return mine.map((c) => {
          const problem = STATUS[c.status];
          return (
            <div key={c.id} className="row" style={{ alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="row-label">
                  {c.institution ?? label} {c.env === "sandbox" && <Tag tone="tag-outline">Sandbox</Tag>}
                </span>
                <span className="cell-sub" style={problem ? { color: "var(--danger)" } : undefined}>
                  {problem ?? ago(c.lastSyncedAt)}
                </span>
              </span>
              {(c.status === "login_required" || c.status === "pending_expiration") && (
                <button type="button" className="btn btn-sm" disabled={busy != null} onClick={() => link(c.id, { id: c.id })}>
                  Sign in
                </button>
              )}
              <button type="button" className="btn btn-sm" disabled={busy != null} onClick={() => sync(c)}>
                {busy === c.id ? "Syncing…" : "Sync"}
              </button>
              <button type="button" className="btn btn-sm" disabled={busy != null} onClick={() => disconnect(c)} aria-label={`Disconnect ${c.institution ?? label}`}>
                Disconnect
              </button>
            </div>
          );
        });
      })}
    </section>
  );
}
