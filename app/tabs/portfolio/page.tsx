"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FormSheet, type Field } from "@/components/FormSheet";
import { IconChevron, IconPlus } from "@/components/Icons";
import { ScreenHeader, Segmented, Tag } from "@/components/ui";
import {
  CARD_SECTIONS, keyOf, MONTH, PROJECT_TAGS, type Card, type FileName, type Item, type Project, type TimelineMonth,
} from "@/lib/portfolio/types";

// Portfolio (Once in a while): the public portfolio site's projects, timeline and
// experience cards, read from and saved through the site's editor API. Every word is
// the owner's; saves are live after the site rebuilds (~1–2 minutes).

const VIEWS: { value: FileName; label: string }[] = [
  { value: "projects", label: "Projects" },
  { value: "timeline", label: "Timeline" },
  { value: "cards", label: "Experience" },
];

type Values = Record<string, unknown>;
const toLines = (v: unknown) => String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const toList = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const hiddenField: Field = { name: "hidden", label: "Hidden from site", type: "toggle" };

const FIELDS: Record<FileName, Field[]> = {
  projects: [
    { name: "title", label: "Title", full: true },
    { name: "bullets", label: "Bullets, one per line (first = summary on the card)", type: "textarea", trim: false, full: true },
    { name: "skills", label: "Skills, comma-separated", full: true, placeholder: "TypeScript, Postgres" },
    { name: "tags", label: `Tags: ${PROJECT_TAGS.join(", ")}`, full: true, placeholder: "Full-Stack" },
    { name: "dateRange", label: "Dates (optional)", placeholder: "Oct 2026 – Nov 2026" },
    { name: "repoUrl", label: "Repo link (optional)", placeholder: "https://github.com/…" },
    { name: "metrics", label: "Metrics, one per line (optional)", type: "textarea", trim: false, full: true },
    hiddenField,
  ],
  timeline: [
    { name: "monthLabel", label: "Month (e.g. Feb 2026)", full: true },
    { name: "employer", label: "Jobs and roles, one per line", type: "textarea", trim: false, full: true },
    { name: "courses", label: "Courses, one per line", type: "textarea", trim: false, full: true },
    { name: "certs", label: "Certifications, one per line", type: "textarea", trim: false, full: true },
    { name: "projects", label: "Projects, one per line", type: "textarea", trim: false, full: true },
    hiddenField,
  ],
  cards: [
    { name: "section", label: "Section", type: "select", options: [...CARD_SECTIONS] },
    { name: "title", label: "Title (Role @ Company)", full: true },
    { name: "logo", label: "Logo path (blank = none; upload first)", full: true, placeholder: "assets/acme.png" },
    { name: "bullets", label: "Bullets, one per line", type: "textarea", trim: false, full: true },
    { name: "skills", label: "Skills, comma-separated", full: true },
    hiddenField,
  ],
};

function valuesOf(file: FileName, it: Item | null): Values {
  if (file === "projects") {
    const p = (it ?? { title: "", bullets: [], skills: [], tags: [] }) as Project;
    return {
      title: p.title, bullets: p.bullets.join("\n"), skills: p.skills.join(", "), tags: p.tags.join(", "),
      dateRange: p.dateRange ?? "", repoUrl: p.repoUrl ?? "", metrics: (p.metrics ?? []).join("\n"), hidden: !!p.hidden,
    };
  }
  if (file === "timeline") {
    const t = (it ?? { monthLabel: "" }) as TimelineMonth;
    return {
      monthLabel: t.monthLabel, employer: (t.employer ?? []).join("\n"), courses: (t.courses ?? []).join("\n"),
      certs: (t.certs ?? []).join("\n"), projects: (t.projects ?? []).join("\n"), hidden: !!t.hidden,
    };
  }
  const c = (it ?? { section: "experience", title: "", logo: "", bullets: [], skills: [] }) as Card;
  return { section: c.section, title: c.title, logo: c.logo, bullets: c.bullets.join("\n"), skills: c.skills.join(", "), hidden: !!c.hidden };
}

function itemOf(file: FileName, v: Values): Item {
  if (file === "projects") {
    return {
      title: String(v.title).trim(), bullets: toLines(v.bullets), skills: toList(v.skills), tags: toList(v.tags),
      dateRange: String(v.dateRange ?? ""), repoUrl: String(v.repoUrl ?? ""), metrics: toLines(v.metrics), hidden: Boolean(v.hidden),
    };
  }
  if (file === "timeline") {
    return {
      monthLabel: String(v.monthLabel).trim(), employer: toLines(v.employer), courses: toLines(v.courses),
      certs: toLines(v.certs), projects: toLines(v.projects), hidden: Boolean(v.hidden),
    };
  }
  return {
    section: v.section as Card["section"], title: String(v.title).trim(), logo: String(v.logo ?? ""),
    bullets: toLines(v.bullets), skills: toList(v.skills), hidden: Boolean(v.hidden),
  };
}

/** Quick checks before sending; the site's API validates everything again. */
function validate(file: FileName, v: Values): string | null {
  if (file === "timeline") return MONTH.test(String(v.monthLabel ?? "").trim()) ? null : "Month must look like Feb 2026.";
  if (!String(v.title ?? "").trim()) return "Title is required.";
  if (file === "projects") {
    const bad = toList(v.tags).filter((t) => !(PROJECT_TAGS as readonly string[]).includes(t));
    if (bad.length) return `Tags must be among ${PROJECT_TAGS.join(", ")} (not ${bad.join(", ")}).`;
    const url = String(v.repoUrl ?? "").trim();
    if (url && !/^https?:\/\//.test(url)) return "The repo link must start with http:// or https://.";
  }
  if (file === "cards") {
    const logo = String(v.logo ?? "").trim();
    if (logo && !logo.startsWith("assets/")) return "The logo path starts with assets/ (upload it first).";
  }
  return null;
}

const label = (file: FileName, it: Item) => String((it as unknown as Record<string, string>)[keyOf(file)]);

function subtitle(file: FileName, it: Item): string {
  if (file === "projects") {
    const p = it as Project;
    return [p.dateRange, p.tags.join(", ")].filter(Boolean).join(" · ");
  }
  if (file === "timeline") {
    // The site shows one category per month: jobs, else courses, else certs and projects.
    const t = it as TimelineMonth;
    const shown = t.employer?.length ? t.employer : t.courses?.length ? t.courses : [...(t.certs ?? []), ...(t.projects ?? [])];
    return shown.join(" · ");
  }
  return (it as Card).section === "certification" ? "Certification" : "Experience";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (m: string) => Number(m.slice(4)) * 12 + MONTHS.indexOf(m.slice(0, 3));

export default function PortfolioPage() {
  const [view, setView] = useState<FileName>("projects");
  // Which file the loaded items are from: right after switching views, the old view's items
  // are still here, and they must not be read as the new view's (months sort by monthLabel).
  const [loaded, setLoaded] = useState<{ file: FileName; items: Item[] } | null>(null);
  const items = loaded?.file === view ? loaded.items : null;
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ item: Item | null; initial?: Values } | null>(null);
  const [notice, setNotice] = useState<{ text: string; errors?: string[]; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (file: FileName) => {
    setLoaded(null);
    setLoadError(null);
    const res = await fetch(`/api/portfolio?file=${file}`, { cache: "no-store" }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { configured?: boolean; items?: Item[]; error?: string } | undefined;
    if (!res?.ok) return setLoadError(out?.error ?? "Couldn't reach the server.");
    setConfigured(out?.configured !== false);
    setLoaded({ file, items: out?.items ?? [] });
  }, []);
  useEffect(() => {
    load(view);
  }, [view, load]);

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: view, ...body }) }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { error?: string; errors?: string[] } | undefined;
    setBusy(false);
    if (res?.ok) setNotice({ text: "Saved. It's live on the site in about 1–2 minutes.", ok: true });
    else if (out?.errors) setNotice({ text: "The site didn't accept that:", errors: out.errors });
    else setNotice({ text: out?.error ?? "Failed." });
    load(view);
  };

  const uploadLogo = async (f: File) => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/portfolio/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "content-type": f.type }, body: f }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as { path?: string; error?: string } | undefined;
    setBusy(false);
    if (!res?.ok || !out?.path) return setNotice({ text: out?.error ?? "Upload failed." });
    // Start a card with the uploaded logo filled in.
    setSheet({ item: null, initial: { ...valuesOf("cards", null), logo: out.path } });
  };

  // Projects and cards show in site order; months newest first (the site sorts them itself).
  const shown = items && view === "timeline"
    ? [...items].sort((a, b) => monthKey((b as TimelineMonth).monthLabel) - monthKey((a as TimelineMonth).monthLabel))
    : items;

  return (
    <main className="screen">
      <ScreenHeader title="Portfolio" back="/tabs" />
      <div className="card pad" style={{ padding: "var(--s-2)" }}>
        <Segmented options={VIEWS} value={view} onChange={(v) => (setNotice(null), setView(v))} />
      </div>

      {!configured && (
        <p className="watch-fallback">
          Portfolio isn&rsquo;t set up on the server yet: add PORTFOLIO_BASE_URL, PORTFOLIO_ADMIN_USERNAME and PORTFOLIO_ADMIN_PASSWORD.
        </p>
      )}
      {loadError && <p role="alert" className="watch-fallback">{loadError}</p>}
      {notice && (
        <div role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)" }}>
          {notice.text}
          {notice.errors && <ul style={{ margin: "4px 0 0", paddingLeft: "1.2em" }}>{notice.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}

      {configured && !loadError && (
        <>
          <div className="card list">
            {!shown && <div className="empty"><span>Loading…</span></div>}
            {shown?.length === 0 && <div className="empty"><span>Nothing here yet.</span></div>}
            {shown?.map((it) => (
              <button key={label(view, it)} type="button" className="row" onClick={() => setSheet({ item: it })}>
                <span className="row-label" style={it.hidden ? { color: "var(--text-3)" } : undefined}>
                  {label(view, it)} {it.hidden && <Tag tone="tag-outline">Hidden</Tag>}
                  {subtitle(view, it) && <span className="cell-sub" style={{ display: "block" }}>{subtitle(view, it)}</span>}
                </span>
                <IconChevron />
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => setSheet({ item: null })}>
              <IconPlus size={14} /> {view === "timeline" ? "Add month" : view === "projects" ? "Add project" : "Add card"}
            </button>
            {view === "cards" && (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
                  Upload logo
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadLogo(f);
                  }}
                />
              </>
            )}
          </div>
          {busy && <p className="faint" style={{ margin: 0, fontSize: "var(--t-sm)" }}>Saving to the site…</p>}
          <p className="faint" style={{ margin: 0, fontSize: "var(--t-xs)" }}>
            Public site. Changes go live 1–2 minutes after saving. Hide things instead of deleting; hidden items stay in the data.
          </p>
        </>
      )}

      {sheet && (
        <FormSheet
          title={sheet.item ? `Edit ${view === "timeline" ? "month" : view === "projects" ? "project" : "card"}` : view === "timeline" ? "Add month" : view === "projects" ? "Add project" : "Add card"}
          submitLabel={sheet.item ? "Save to site" : "Add to site"}
          fields={FIELDS[view]}
          initial={sheet.initial ?? valuesOf(view, sheet.item)}
          validate={(v) => validate(view, v)}
          onClose={() => setSheet(null)}
          onSubmit={(v) => {
            const s = sheet;
            setSheet(null);
            save(s.item ? { op: "update", match: label(view, s.item), item: itemOf(view, v) } : { op: "add", item: itemOf(view, v) });
          }}
        />
      )}
    </main>
  );
}
