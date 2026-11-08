"use client";

// Settings > Inbox updates: whether Talos scans Gmail for application emails, whether
// Google allows it to read mail yet, when it last looked, and a manual scan.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { googleApi, type GoogleStatus } from "@/lib/watch/data";

interface Scan {
  enabled: boolean;
  started_at: string;
  last_scanned_at: string | null;
  last_error: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function InboxSettings() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().from("inbox_scan").select("enabled, started_at, last_scanned_at, last_error").eq("id", 1).maybeSingle();
    if (data) setScan(data);
  }, []);
  useEffect(() => {
    load();
    googleApi.status().then(setGoogle);
  }, [load]);

  if (!scan) return <p className="faint">Loading…</p>;
  const canRead = !!google?.canReadMail;

  const toggle = async () => {
    const enabled = !scan.enabled;
    setScan({ ...scan, enabled });
    const { error } = await createClient().from("inbox_scan").update({ enabled, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) {
      setNotice({ text: "Failed to save.", ok: false });
      load();
    }
  };
  const scanNow = async () => {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/inbox/scan", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { error?: string; new?: number; proposed?: number; more?: boolean } | null;
    setBusy(false);
    if (!res?.ok || out?.error) setNotice({ text: out?.error ?? "Scan failed.", ok: false });
    else {
      setNotice({
        text: out?.new
          ? `Looked at ${out.new} new email${out.new === 1 ? "" : "s"}; ${out.proposed ? `${out.proposed} to confirm (see the banner)` : "none change Applications"}.${out.more ? " More next scan." : ""}`
          : "No new application emails.",
        ok: true,
      });
      if (out?.proposed) window.location.reload(); // the banner picks them up
    }
    load();
  };

  return (
    <>
      <p className="faint inbox-help">
        Every 15 minutes Talos checks your Gmail for application emails (confirmations, online assessments, interview invites, rejections).
        For each one that changes something, a banner asks before Applications is touched. Only email that arrived after{" "}
        {when(scan.started_at)} is read, and Talos can&rsquo;t change, label or delete any of it.
      </p>
      <div className="card list">
        <div className="row">
          <span className="row-label">Scan my inbox</span>
          <button type="button" role="switch" className="switch" aria-checked={scan.enabled} aria-label="Scan my inbox" onClick={toggle} />
        </div>
        {google === undefined ? null : !google?.connected ? (
          <button type="button" className="row" onClick={() => googleApi.connect("/settings/inbox")}>
            <span className="row-label">Connect Google</span>
            <span className="row-value" style={{ color: "var(--accent)" }}>Connect</span>
          </button>
        ) : !canRead ? (
          <button type="button" className="row" onClick={() => googleApi.connect("/settings/inbox")}>
            <span className="row-label">Reconnect Google to allow reading mail</span>
            <span className="row-value" style={{ color: "var(--accent)" }}>Reconnect</span>
          </button>
        ) : (
          <div className="row">
            <span className="row-label">Gmail</span>
            <span className="row-value">{google.email}</span>
          </div>
        )}
        <div className="row">
          <span className="row-label">Last scanned</span>
          <span className="row-value">{scan.last_scanned_at ? when(scan.last_scanned_at) : "Not yet"}</span>
        </div>
        <button type="button" className="row" onClick={scanNow} disabled={busy || !canRead}>
          <span className="row-label">Scan now</span>
          <span className="row-value">{busy ? "Scanning…" : ""}</span>
        </button>
      </div>
      {scan.last_error && <p role="alert" className="inbox-error">Last scan failed: {scan.last_error}</p>}
      {notice && <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "faint" : "inbox-error"}>{notice.text}</p>}
    </>
  );
}
