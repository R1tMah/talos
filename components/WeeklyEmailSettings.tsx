"use client";

// Settings > Weekly email: on/off, which sections go in, and a test send. The email
// goes out Sundays at 1 PM from the owner's Gmail to themselves (lib/email/weekly.ts).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { fmtDay } from "@/lib/date";
import { SECTIONS, type Section } from "@/lib/email/weekly";
import { googleApi, type GoogleStatus } from "@/lib/watch/data";

interface Cfg { enabled: boolean; sections: Section[]; lastSentOn: string | null; lastError: string | null }

export function WeeklyEmailSettings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "Sending…">("");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().from("weekly_email").select("*").eq("id", 1).maybeSingle();
    if (data) setCfg({ enabled: data.enabled, sections: data.sections as Section[], lastSentOn: data.last_sent_on, lastError: data.last_error });
  }, []);
  useEffect(() => {
    load();
    googleApi.status().then(setGoogle);
  }, [load]);

  const save = async (next: Pick<Cfg, "enabled" | "sections">) => {
    setCfg((c) => (c ? { ...c, ...next } : c));
    const { error } = await createClient().from("weekly_email")
      .update({ enabled: next.enabled, sections: next.sections, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) {
      setNotice({ text: "Failed to save.", ok: false });
      load();
    }
  };

  const test = async () => {
    setBusy("Sending…");
    setNotice(null);
    const res = await fetch("/api/email/weekly", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { error?: string; reconnect?: boolean } | undefined;
    setBusy("");
    if (res?.ok) setNotice({ text: `Sent to ${google?.email ?? "your Gmail"}. Check your inbox.`, ok: true });
    else if (out?.reconnect) setGoogle((g) => (g ? { ...g, canSendMail: false } : g));
    else setNotice({ text: `Couldn't send: ${out?.error ?? "failed"}`, ok: false });
  };

  if (!cfg) return null;
  const needsGoogle = google !== undefined && (!google?.connected || !google.canSendMail);

  return (
    <>
      <span className="label group-title">Weekly email</span>
      <div className="card list">
        <div className="row">
          <span className="row-label">Email me Sundays at 1 PM</span>
          <button
            type="button" role="switch" className="switch" aria-checked={cfg.enabled} aria-label="Weekly email on"
            onClick={() => save({ enabled: !cfg.enabled, sections: cfg.sections })}
          />
        </div>
        {SECTIONS.map((s) => {
          const on = cfg.sections.includes(s.key);
          return (
            <div key={s.key} className="row">
              <span className="row-label" style={cfg.enabled ? undefined : { color: "var(--text-3)" }}>{s.label}</span>
              <button
                type="button" role="switch" className="switch" aria-checked={on} aria-label={`Include ${s.label}`} disabled={!cfg.enabled}
                onClick={() => save({ enabled: cfg.enabled, sections: on ? cfg.sections.filter((x) => x !== s.key) : [...cfg.sections, s.key] })}
              />
            </div>
          );
        })}
        {needsGoogle ? (
          <button type="button" className="row" onClick={() => googleApi.connect("/settings")}>
            <span className="row-label">{google?.connected ? "Reconnect Google to allow sending" : "Connect Google to send"}</span>
            <span className="row-value" style={{ color: "var(--accent)" }}>Connect</span>
          </button>
        ) : (
          <button type="button" className="row" onClick={test} disabled={!!busy || !cfg.sections.length}>
            <span className="row-label">Send a test email now</span>
            <span className="row-value">{busy || (google?.email ?? "")}</span>
          </button>
        )}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        From your Gmail to yourself. Your own entries and numbers only, nothing written by AI.
        {cfg.lastSentOn && ` Last sent ${fmtDay(cfg.lastSentOn)}.`}
        {cfg.lastError && ` Last try failed: ${cfg.lastError}`}
      </p>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: "0 var(--s-4)" }}>
          {notice.text}
        </p>
      )}
    </>
  );
}
