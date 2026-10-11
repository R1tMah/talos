"use client";

import { useEffect, useRef, useState } from "react";
import { onToast, type ToastMsg } from "@/lib/undo";

/** One toast at a time above the tab bar: "Saved: ... · Undo", then "Undid: ... · Redo". */
export function UndoToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      onToast((t) => {
        setToast(t);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), 6000);
      }),
    [],
  );

  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: "calc(var(--tabbar-h, 64px) + env(safe-area-inset-bottom) + 12px)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 12,
        background: "var(--surface-2, var(--surface))",
        border: "1px solid var(--border-strong, var(--border))",
        boxShadow: "0 6px 24px rgb(0 0 0 / 0.25)",
        fontSize: "var(--t-sm)",
        color: toast.tone === "error" ? "var(--danger)" : "var(--text)",
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const run = toast.action!.run;
            setToast(null);
            run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
