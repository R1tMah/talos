"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Full-screen plain-text editor. Text is stored exactly as typed. */
export function FullScreenEditor({
  title, value, onChange, onDone, left, right, placeholder,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
  left?: ReactNode;
  right?: ReactNode;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!value) ref.current?.focus();
  }, []);

  return (
    <div className="editor" role="dialog" aria-modal aria-label={title}>
      <div className="editor-bar">
        <div style={{ width: 88, display: "flex" }}>{left}</div>
        <span className="editor-title">{title}</span>
        <div style={{ width: 88, display: "flex", justifyContent: "flex-end", gap: 4 }}>
          {right}
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--accent)", fontWeight: 600 }} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        autoCapitalize="sentences"
      />
    </div>
  );
}
