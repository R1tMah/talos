"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/date";
import { tabCount, tabCsv, tabMarkdown, tabTitle, toCsv, toMarkdown, type ExportTab, type TabExport } from "@/lib/exportTab";
import { loadExport, type LiveTab } from "@/lib/exportLive";
import { useStore } from "@/lib/store";
import { Sheet } from "./FormSheet";
import { IconShare } from "./Icons";

const LIVE_TITLES: Record<LiveTab, string> = {
  nutrition: "Nutrition", leetcode: "LeetCode", callbacks: "Callbacks", content: "Content", journal: "Work Journal",
};

/**
 * Header button that exports just this tab. Supabase-backed tabs either pass their
 * rows as `source`, or set `live` to fetch the full history when the sheet opens.
 * Anything else exports the local store.
 */
export function ExportButton({ tab, source: given, live }: { tab: ExportTab; source?: TabExport; live?: LiveTab }) {
  const { db } = useStore();
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
  const title = source?.title ?? (live ? LIVE_TITLES[live] : tabTitle(tab, db));
  const count = source?.rows.length ?? (live ? 0 : tabCount(tab, db));
  const markdown = () => (source ? toMarkdown(source) : tabMarkdown(tab, db));
  const csv = () => (source ? toCsv(source) : tabCsv(tab, db));

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
      <button type="button" className="icon-btn" aria-label={`Export ${title}`} onClick={() => setOpen(true)}>
        <IconShare />
      </button>
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
              `${count} ${count === 1 ? "entry" : "entries"}, newest first`
            )}
          </p>
        </Sheet>
      )}
    </>
  );
}
