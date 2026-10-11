"use client";

import { useState } from "react";
import { todayISO } from "@/lib/date";
import { tabCount, tabCsv, tabMarkdown, tabTitle, type ExportTab } from "@/lib/exportTab";
import { useStore } from "@/lib/store";
import { Sheet } from "./FormSheet";
import { IconShare } from "./Icons";

/** Header button that exports just this tab. */
export function ExportButton({ tab }: { tab: ExportTab }) {
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<"" | "Copied" | "Failed">("");
  const title = tabTitle(tab, db);
  const count = tabCount(tab, db);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(tabMarkdown(tab, db));
      setCopy("Copied");
    } catch {
      setCopy("Failed");
    }
    setTimeout(() => setCopy(""), 2000);
  };

  const downloadCsv = () => {
    // Leading BOM so Excel and Numbers read non-ASCII text correctly.
    const blob = new Blob(["﻿" + tabCsv(tab, db)], { type: "text/csv" });
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
            <button type="button" className="row" onClick={copyMarkdown}>
              <span className="row-label">Copy as markdown</span>
              <span className="row-value" style={{ color: copy === "Failed" ? "var(--danger)" : copy ? "var(--accent)" : undefined }}>
                {copy || "Clipboard"}
              </span>
            </button>
            <button type="button" className="row" onClick={downloadCsv}>
              <span className="row-label">Download CSV</span>
              <span className="row-value">Spreadsheet</span>
            </button>
          </div>
          <p className="faint num" style={{ fontSize: "var(--t-xs)", margin: "var(--s-3) var(--s-1) 0" }}>
            {count} {count === 1 ? "entry" : "entries"}, newest first
          </p>
        </Sheet>
      )}
    </>
  );
}
