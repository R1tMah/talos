"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/date";
import { toCsv, toMarkdown, type ExportTab, type TabExport } from "@/lib/exportTab";
import { loadExport, type LiveTab } from "@/lib/exportLive";
import { Sheet } from "./FormSheet";
import { IconShare } from "./Icons";

const LIVE_TITLES: Record<LiveTab, string> = {
  nutrition: "Nutrition", leetcode: "LeetCode", callbacks: "Callbacks", content: "Content", journal: "Work Journal", personal: "Personal Journal", talos: "Talos Improvements",
};

/**
 * Header button that exports just this tab, from Supabase: either the screen's rows
 * (`source`), or the full history fetched when the sheet opens (`live`).
 */
export function ExportButton({
  tab, text, order = "newest first", variant = "icon", ...from
}: {
  tab: ExportTab;
  /** "icon" for a header, "button" for a full-width Export button at the bottom of a screen. */
  variant?: "icon" | "button";
  /** Replaces the generated markdown for "Copy" (e.g. Weight's week-by-week log). */
  text?: string;
  /** How the rows are ordered, shown under the buttons. */
  order?: string;
} & ({ source: TabExport; live?: never } | { live: LiveTab; source?: never })) {
  const given = from.source;
  const live = from.live;
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<"" | "Copied" | "Failed">("");
  const [fetched, setFetched] = useState<TabExport | "loading" | "failed" | null>(null);

  useEffect(() => {
    if (!open || !live) return;
    let current = true;
    setFetched("loading");
    loadExport(live).then(
      (t) => current && setFetched(t),
      () => current && setFetched("failed"),
    );
    return () => {
      current = false;
    };
  }, [open, live]);

  const source = given ?? (fetched && typeof fetched === "object" ? fetched : undefined);
  const waiting = !!live && !source;
  const title = source?.title ?? (live ? LIVE_TITLES[live] : "");
  const count = source?.rows.length ?? 0;
  const markdown = () => text ?? (source ? toMarkdown(source) : "");
  const csv = () => (source ? toCsv(source) : "");

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopy("Copied");
    } catch {
      setCopy("Failed");
    }
    setTimeout(() => setCopy(""), 2000);
  };

  const downloadCsv = () => {
    // Leading BOM so Excel and Numbers read non-ASCII text correctly.
    const blob = new Blob(["﻿" + csv()], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `talos-${tab}-${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      {variant === "button" ? (
        <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setOpen(true)}>
          <IconShare size={16} /> Export {title}
        </button>
      ) : (
        <button type="button" className="icon-btn" aria-label={`Export ${title}`} onClick={() => setOpen(true)}>
          <IconShare />
        </button>
      )}
      {open && (
        <Sheet title={`Export ${title}`} onClose={() => setOpen(false)}>
          <div className="card list">
            <button type="button" className="row" onClick={copyMarkdown} disabled={waiting}>
              <span className="row-label">Copy as markdown</span>
              <span className="row-value" style={{ color: copy === "Failed" ? "var(--danger)" : copy ? "var(--accent)" : undefined }}>
                {copy || "Clipboard"}
              </span>
            </button>
            <button type="button" className="row" onClick={downloadCsv} disabled={waiting}>
              <span className="row-label">Download CSV</span>
              <span className="row-value">Spreadsheet</span>
            </button>
          </div>
          <p className="faint num" style={{ fontSize: "var(--t-xs)", margin: "var(--s-3) var(--s-1) 0" }}>
            {fetched === "failed" ? (
              <span style={{ color: "var(--danger)" }}>Failed</span>
            ) : waiting ? (
              "Loading…"
            ) : (
              `${count} ${count === 1 ? "entry" : "entries"}, ${order}`
            )}
          </p>
        </Sheet>
      )}
    </>
  );
}
