"use client";

// Settings > Weekly email: on/off, the day and hour it goes out, which items go in, whether
// empty lines are left out, a preview and a test send. It goes from the owner's Gmail to
// themselves (lib/email/weekly.ts).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { fmtDay } from "@/lib/date";
import { DAYS, GROUPS, HOURS, ITEMS, hourLabel, isItem, type Item } from "@/lib/email/weekly";
import { googleApi, type GoogleStatus } from "@/lib/watch/data";
import { Sheet } from "./FormSheet";

interface Cfg {
  enabled: boolean;
  items: Item[];
  day: number;
  hour: number;
  hideEmpty: boolean;
  lastSentOn: string | null;
  lastError: string | null;
}
type Editable = Pick<Cfg, "enabled" | "items" | "day" | "hour" | "hideEmpty">;

export function WeeklyEmailSettings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "Sending…" | "Loading…">("");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().from("weekly_email").select("*").eq("id", 1).maybeSingle();
    if (data) {
      setCfg({
        enabled: data.enabled, items: data.sections.filter(isItem), day: data.send_day, hour: data.send_hour, hideEmpty: data.hide_empty,
        lastSentOn: data.last_sent_on, lastError: data.last_error,
      });
    }
  }, []);
  useEffect(() => {
    load();
    googleApi.status().then(setGoogle);
  }, [load]);

  const save = async (change: Partial<Editable>) => {
    if (!cfg) return;
    const next = { ...cfg, ...change };
    setCfg(next);
    // Items are saved in the email's own order, whatever order they were switched on in.
    const sections = ITEMS.map((i) => i.key).filter((k) => next.items.includes(k));
    const { error } = await createClient().from("weekly_email")
      .update({ enabled: next.enabled, sections, send_day: next.day, send_hour: next.hour, hide_empty: next.hideEmpty, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) {
      setNotice({ text: "Failed to save.", ok: false });
      load();
    }
  };

  const call = async (body: object) => {
    const res = await fetch("/api/email/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { error?: string; reconnect?: boolean; subject?: string; html?: string } | undefined;
    return { ok: !!res?.ok, out };
  };

  const test = async () => {
    setBusy("Sending…");
    setNotice(null);
    const { ok, out } = await call({});
    setBusy("");
    if (ok) setNotice({ text: `Sent to ${google?.email ?? "your Gmail"}. Check your inbox.`, ok: true });
    else if (out?.reconnect) setGoogle((g) => (g ? { ...g, canSendMail: false } : g));
    else setNotice({ text: `Couldn't send: ${out?.error ?? "failed"}`, ok: false });
  };

  const showPreview = async () => {
    setBusy("Loading…");
    setNotice(null);
    const { ok, out } = await call({ preview: true });
    setBusy("");
    if (ok && out?.html) setPreview({ subject: out.subject ?? "", html: out.html });
    else setNotice({ text: `Couldn't build the preview: ${out?.error ?? "failed"}`, ok: false });
  };

  if (!cfg) return null;
  const needsGoogle = google !== undefined && (!google?.connected || !google.canSendMail);
  const dim = cfg.enabled ? undefined : { color: "var(--text-3)" };

  return (
    <>
      <div className="card list">
        <div className="row">
          <span className="row-label">Send the weekly email</span>
          <button
            type="button" role="switch" className="switch" aria-checked={cfg.enabled} aria-label="Weekly email on"
            onClick={() => save({ enabled: !cfg.enabled })}
          />
        </div>
        <label className="row">
          <span className="row-label" style={dim}>Day</span>
          <select className="row-select" value={cfg.day} disabled={!cfg.enabled} onChange={(e) => save({ day: Number(e.target.value) })}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
        <label className="row">
          <span className="row-label" style={dim}>Time</span>
          <select className="row-select" value={cfg.hour} disabled={!cfg.enabled} onChange={(e) => save({ hour: Number(e.target.value) })}>
            {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </label>
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        In your timezone. The summary covers the 7 days ending that day.
      </p>

      {GROUPS.map((g) => (
        <section key={g}>
          <span className="label group-title">{g}</span>
          <div className="card list">
            {ITEMS.filter((i) => i.group === g).map((i) => {
              const on = cfg.items.includes(i.key);
              return (
                <div key={i.key} className="row">
                  <span className="row-label" style={dim}>{i.label}</span>
                  <button
                    type="button" role="switch" className="switch" aria-checked={on} aria-label={`Include ${i.label}`} disabled={!cfg.enabled}
                    onClick={() => save({ items: on ? cfg.items.filter((x) => x !== i.key) : [...cfg.items, i.key] })}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <span className="label group-title">Options</span>
      <div className="card list">
        <div className="row">
          <span className="row-label" style={dim}>Leave out empty lines</span>
          <button
            type="button" role="switch" className="switch" aria-checked={cfg.hideEmpty} aria-label="Leave out empty lines" disabled={!cfg.enabled}
            onClick={() => save({ hideEmpty: !cfg.hideEmpty })}
          />
        </div>
        <button type="button" className="row" onClick={showPreview} disabled={!!busy || !cfg.items.length}>
          <span className="row-label">Preview</span>
          <span className="row-value">{busy === "Loading…" ? busy : ""}</span>
        </button>
        {needsGoogle ? (
          <button type="button" className="row" onClick={() => googleApi.connect("/settings")}>
            <span className="row-label">{google?.connected ? "Reconnect Google to allow sending" : "Connect Google to send"}</span>
            <span className="row-value" style={{ color: "var(--accent)" }}>Connect</span>
          </button>
        ) : (
          <button type="button" className="row" onClick={test} disabled={!!busy || !cfg.items.length}>
            <span className="row-label">Send a test email now</span>
            <span className="row-value">{busy === "Sending…" ? busy : (google?.email ?? "")}</span>
          </button>
        )}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        Leaving out empty lines drops ones like &ldquo;no weigh-ins this week&rdquo;. From your Gmail to yourself. Your own entries and numbers only, nothing written by AI.
        {cfg.lastSentOn && ` Last sent ${fmtDay(cfg.lastSentOn)}.`}
        {cfg.lastError && ` Last try failed: ${cfg.lastError}`}
      </p>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: "0 var(--s-4)" }}>
          {notice.text}
        </p>
      )}

      {preview && (
        <Sheet title="Preview" onClose={() => setPreview(null)}>
          <p className="faint" style={{ fontSize: "var(--t-sm)", margin: "0 0 var(--s-2)" }}>{preview.subject}</p>
          {/* sandbox with no permissions: the owner's text renders, nothing in it runs. */}
          <iframe title="Weekly email preview" sandbox="" srcDoc={preview.html} className="email-preview" />
        </Sheet>
      )}
    </>
  );
}
