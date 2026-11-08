"use client";

// Inbox updates: when the scan found an application email, a banner asks about it on any
// screen ("Did you get a rejection from Ramp?"). Yes applies the change to Applications
// (and Callbacks, for an OA or interview); No drops it. One at a time, oldest first.

import { useCallback, useEffect, useState } from "react";
import { bannerDetail, bannerText, isEmailKind, type PendingUpdate } from "@/lib/inbox";
import { dataChanged, showToast } from "@/lib/undo";
import { createClient } from "@/utils/supabase/client";

export function InboxBanner() {
  const [items, setItems] = useState<PendingUpdate[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await createClient().from("pending_inbox_updates")
      .select("id, kind, company, role, email_date, subject, sender, application_id, proposed_status").order("created_at");
    setItems((data ?? []).filter((u): u is PendingUpdate => isEmailKind(u.kind)));
  }, []);

  useEffect(() => {
    load();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  const u = items[0];
  if (!u) return null;

  const done = () => setItems((xs) => xs.slice(1));
  const yes = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("apply_inbox_update", { p_id: u.id });
    setBusy(false);
    const status = (data as { status?: string } | null)?.status;
    if (error || status !== "saved") {
      if (status === "not_found") return done(); // handled elsewhere already
      return showToast({ text: "Couldn't update Applications.", tone: "error" });
    }
    done();
    dataChanged();
    showToast({ text: `${u.company}: ${u.proposed_status}`, tone: "ok" });
  };
  const no = async () => {
    setBusy(true);
    const { error } = await createClient().from("pending_inbox_updates").delete().eq("id", u.id);
    setBusy(false);
    if (error) return showToast({ text: "Couldn't dismiss it.", tone: "error" });
    done();
  };

  return (
    <div className="inbox-banner card" role="alert">
      <div className="inbox-banner-head">
        <span className="label">From your inbox{items.length > 1 ? ` · 1 of ${items.length}` : ""}</span>
      </div>
      <span className="inbox-banner-q">{bannerText(u)}</span>
      <span className="faint inbox-banner-sub">{bannerDetail(u)}</span>
      {(u.subject || u.sender) && (
        <span className="faint inbox-banner-mail" title={u.sender ?? undefined}>
          “{u.subject || "(no subject)"}”{u.sender ? ` · ${u.sender.replace(/\s*<.*>$/, "")}` : ""}
        </span>
      )}
      <div className="rc-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={yes} disabled={busy}>
          Yes, update
        </button>
        <button type="button" className="btn btn-sm" onClick={no} disabled={busy}>
          No, ignore
        </button>
      </div>
    </div>
  );
}
