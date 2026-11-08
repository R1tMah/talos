"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { FormSheet, Sheet } from "@/components/FormSheet";
import { IconChevron } from "@/components/Icons";
import { MockModelSettings } from "@/components/MockModelSettings";
import { PageSkeleton } from "@/components/Skeleton";
import { ScreenHeader, Segmented } from "@/components/ui";
import { useArchivedTabs } from "@/lib/archivedTabs";
import { buildBackup } from "@/lib/backup";
import { fmtNum, todayISO } from "@/lib/date";
import { DAYS, hourLabel } from "@/lib/email/weekly";
import { FLAGS } from "@/lib/flags";
import { buildReviewPacket } from "@/lib/reviewPacket";
import { settingsApi, useSettings, type SettingsResult } from "@/lib/settingsData";
import { ARCHIVABLE } from "@/lib/tabs";
import { createClient } from "@/utils/supabase/client";

type Edit = "targets" | "rest" | "context" | "confidence" | "timezone" | "plans" | null;
type Theme = "system" | "dark" | "light";

function Row({ label, value, onClick, href }: { label: string; value?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="row-label">{label}</span>
      {value && <span className="row-value num">{value}</span>}
      <IconChevron />
    </>
  );
  return href ? (
    <Link href={href} className="row">
      {inner}
    </Link>
  ) : (
    <button type="button" className="row" onClick={onClick}>
      {inner}
    </button>
  );
}

const isInt = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A settings section with several rows, folded into an accordion (closed until tapped). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="card list archived-acc">
      <summary>
        <span className="label">{title}</span>
        <IconChevron />
      </summary>
      {children}
    </details>
  );
}

/** The weekly email's row value ("Sun · 1 PM" or "Off"); null while loading. */
function useWeeklyEmailOn() {
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    createClient().from("weekly_email").select("enabled, send_day, send_hour").eq("id", 1).maybeSingle()
      .then(({ data }) => data && setOn(data.enabled ? `${DAYS[data.send_day].slice(0, 3)} · ${hourLabel(data.send_hour)}` : "Off"));
  }, []);
  return on;
}

export default function SettingsPage() {
  const { data, failed, reload } = useSettings();
  const [edit, setEdit] = useState<Edit>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [copy, setCopy] = useState<"" | "Copying…" | "Copied" | "Failed">("");
  const [theme, setTheme] = useState<Theme>("system");
  const archived = useArchivedTabs();
  const weeklyOn = useWeeklyEmailOn();

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("talos.theme") as Theme) || "system");
    } catch {}
  }, []);

  // Theme is a per-device preference, so it stays in this browser.
  const applyTheme = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("talos.theme");
      else localStorage.setItem("talos.theme", t);
    } catch {}
  };

  /** Runs a settings write, closes the sheet, and reports the outcome in plain words. */
  const run = async (write: Promise<SettingsResult>, ok: string) => {
    setEdit(null);
    setNotice(null);
    const r = await write;
    if (r.status === "saved") setNotice({ text: ok, ok: true });
    else if (r.status === "invalid") setNotice({ text: r.detail, ok: false });
    else if (r.status !== "unchanged") setNotice({ text: "Failed", ok: false });
    await reload();
  };

  // Both read Supabase when tapped. Safari only lets the clipboard be written during
  // the tap, so the copy hands it a promise (ClipboardItem) instead of awaiting first.
  const exportPacket = async () => {
    setCopy("Copying…");
    try {
      const text = buildReviewPacket();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      setCopy("Copied");
    } catch {
      setCopy("Failed");
    }
    setTimeout(() => setCopy(""), 2000);
  };

  const [backingUp, setBackingUp] = useState<"" | "Preparing…" | "Failed">("");
  const backup = async () => {
    setBackingUp("Preparing…");
    try {
      const out = await buildBackup();
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `talos-backup-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setBackingUp("");
    } catch {
      setBackingUp("Failed");
      setTimeout(() => setBackingUp(""), 2000);
    }
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="SETTINGS" brand />
        <p role="alert" className="muted">
          Failed.{" "}
          <button type="button" className="btn btn-sm" onClick={reload}>
            Retry
          </button>
        </p>
      </main>
    ) : (
      <PageSkeleton />
    );
  }

  return (
    <main className="screen">
      <ScreenHeader title="SETTINGS" brand />

      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice.text}
        </p>
      )}

      <Group title="Targets">
        <Row label="Calories" value={`${fmtNum(data.targets.calories)} kcal`} onClick={() => setEdit("targets")} />
        <Row label="Protein" value={`${data.targets.protein} g`} onClick={() => setEdit("targets")} />
      </Group>

      {FLAGS.workout && (
        <>
          <Group title="Workout">
            <Row label="Rest time" value={`${data.restSeconds} s`} onClick={() => setEdit("rest")} />
            <Row label="Plans" value={data.plans.map((p) => p.name).join(", ")} onClick={() => setEdit("plans")} />
          </Group>
        </>
      )}

      <Group title="Logging">
        <Row label="Saved meals" value={String(data.savedMeals)} href="/tabs/nutrition?view=meals" />
        <Row label="Context blurb" value={data.contextBlurb ? `${data.contextBlurb.length} chars` : "Empty"} onClick={() => setEdit("context")} />
      </Group>

      <span className="label group-title">Tabs</span>
      <div className="card list">
        <Row label="Shown and archived" value={archived ? `${ARCHIVABLE.length - archived.size} shown · ${archived.size} archived` : undefined} href="/settings/tabs" />
      </div>

      <Group title="Chat">
        <Row label="Auto-save confidence" value={data.confidence.toFixed(2)} onClick={() => setEdit("confidence")} />
        <Row label="Timezone" value={data.timezone} onClick={() => setEdit("timezone")} />
        <Row label="Chat history" href="/settings/chat-history" />
        <Row label="API usage" href="/settings/api-usage" />
      </Group>

      <span className="label group-title">Talos</span>
      <div className="card list">
        <Row label="About Talos" href="/settings/about" />
        <Row label="Home cards" href="/settings/cards" />
        <Row label="Talos Improvements" href="/settings/talos" />
      </div>

      <span className="label group-title">End of day</span>
      <div className="card list">
        <Row label="EOD questions" href="/settings/eod" />
      </div>

      <span className="label group-title">Applications</span>
      <div className="card list">
        <Row label="Inbox updates" href="/settings/inbox" />
      </div>

      <MockModelSettings />

      <span className="label group-title">Weekly email</span>
      <div className="card list">
        <Row label="Weekly digest" value={weeklyOn ?? undefined} href="/settings/weekly-email" />
      </div>

      <span className="label group-title">Appearance</span>
      <div className="card pad" style={{ padding: "var(--s-2)" }}>
        <Segmented
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          value={theme}
          onChange={applyTheme}
        />
      </div>

      <Group title="Data">
        <button type="button" className="row" onClick={exportPacket}>
          <span className="row-label">Export review packet</span>
          <span className="row-value" style={{ color: copy === "Failed" ? "var(--danger)" : copy ? "var(--accent)" : undefined }}>
            {copy || "Copy markdown"}
          </span>
        </button>
        <button type="button" className="row" onClick={backup} disabled={backingUp === "Preparing…"}>
          <span className="row-label">Download backup</span>
          <span className="row-value" style={{ color: backingUp === "Failed" ? "var(--danger)" : undefined }}>{backingUp || "JSON"}</span>
        </button>
      </Group>

      {edit === "targets" && (
        <FormSheet
          title="Targets"
          confirm
          fields={[
            { name: "calories", label: "Calories", type: "number" },
            { name: "protein", label: "Protein (g)", type: "number" },
          ]}
          initial={data.targets}
          validate={(v) =>
            !isInt(v.calories, 500, 10000) ? "Calories must be a whole number from 500 to 10,000."
              : !isInt(v.protein, 0, 500) ? "Protein must be a whole number from 0 to 500."
              : null
          }
          onClose={() => setEdit(null)}
          onSubmit={(v) =>
            run(settingsApi.setTargets(v.calories as number, v.protein as number), "Targets saved. They apply from today; past days keep theirs.")
          }
        />
      )}
      {edit === "rest" && (
        <FormSheet
          title="Rest time"
          confirm
          fields={[{ name: "rest", label: "Seconds", type: "number", full: true }]}
          initial={{ rest: data.restSeconds }}
          validate={(v) => (!isInt(v.rest, 10, 900) ? "Rest must be 10 to 900 seconds." : null)}
          onClose={() => setEdit(null)}
          onSubmit={(v) => run(settingsApi.update({ rest_seconds: v.rest as number }), "Rest time saved.")}
        />
      )}
      {edit === "context" && (
        <FormSheet
          title="Context blurb"
          confirm
          fields={[{ name: "context", label: "Included in the review packet", type: "textarea", trim: false }]}
          initial={{ context: data.contextBlurb }}
          onClose={() => setEdit(null)}
          onSubmit={(v) => run(settingsApi.update({ context_blurb: String(v.context ?? "") }), "Context saved.")}
        />
      )}
      {edit === "confidence" && (
        <FormSheet
          title="Auto-save confidence"
          confirm
          fields={[{ name: "confidence", label: "0.50 to 0.99. Below it, chat asks before saving.", type: "number", full: true }]}
          initial={{ confidence: data.confidence }}
          validate={(v) =>
            typeof v.confidence !== "number" || v.confidence < 0.5 || v.confidence > 0.99 ? "Use a number from 0.50 to 0.99." : null
          }
          onClose={() => setEdit(null)}
          onSubmit={(v) => run(settingsApi.update({ confidence_threshold: v.confidence as number }), "Confidence saved.")}
        />
      )}
      {edit === "timezone" && (
        <FormSheet
          title="Timezone"
          confirm
          fields={[{ name: "timezone", label: "IANA name, e.g. America/New_York", full: true }]}
          initial={{ timezone: data.timezone }}
          validate={(v) => (!String(v.timezone ?? "").trim() ? "Timezone is required." : null)}
          onClose={() => setEdit(null)}
          onSubmit={(v) => run(settingsApi.update({ timezone: String(v.timezone).trim() }), "Timezone saved.")}
        />
      )}
      {edit === "plans" && (
        <Sheet title="Plans" onClose={() => setEdit(null)}>
          <div className="card list">
            {data.plans.map((p) => (
              <div key={p.name} className="row" style={{ flexDirection: "column", alignItems: "flex-start", padding: "var(--s-3) var(--s-4)" }}>
                <span className="row-label">{p.name}</span>
                <span className="cell-sub" style={{ whiteSpace: "normal" }}>
                  {p.exercises.join(", ") || "No exercises"}
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  );
}
