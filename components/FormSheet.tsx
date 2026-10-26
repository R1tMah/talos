"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Change } from "@/lib/types";
import { ChangeList } from "./ChangeList";
import { IconX } from "./Icons";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "select" | "textarea" | "toggle";
  options?: string[];
  step?: string;
  placeholder?: string;
  full?: boolean;
  /** Small badge next to the label, e.g. "inferred". */
  badge?: string;
  /** Text is stored trimmed unless this is false (keep exactly as typed). */
  trim?: boolean;
  /** Number fields: an empty input becomes null instead of 0 (missing is not zero). */
  optional?: boolean;
}

type Values = Record<string, unknown>;

const show = (f: Field, v: unknown) => (f.type === "toggle" ? (v ? "Yes" : "No") : v == null ? "" : String(v));

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * Add/edit form in a bottom sheet. With `confirm`, saving an edit first shows
 * old to new values and waits for Confirm.
 */
export function FormSheet({
  title, fields, initial, onSubmit, onClose, onDelete, submitLabel = "Save", confirm = false, confirmDelete, validate,
}: {
  title: string;
  fields: Field[];
  initial: object;
  onSubmit: (values: Values) => void;
  onClose: () => void;
  onDelete?: () => void;
  submitLabel?: string;
  /** With `confirm`, deleting also shows a confirm step. */
  confirm?: boolean;
  /** Overrides `confirm` for deleting, when the caller asks its own question (e.g. which occurrences). */
  confirmDelete?: boolean;
  /** Return a message to block saving. */
  validate?: (values: Values) => string | null;
}) {
  const init = initial as Values;
  const [vals, setVals] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.type === "toggle" ? Boolean(init[f.name]) : show(f, init[f.name])])),
  );
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = (): Values =>
    Object.fromEntries(
      fields.map((f) => {
        const v = vals[f.name];
        if (f.type === "number") return [f.name, v === "" ? (f.optional ? null : 0) : Number(v)];
        if (f.type === "toggle") return [f.name, Boolean(v)];
        return [f.name, typeof v === "string" && f.trim !== false ? v.trim() : v];
      }),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deleting) return onDelete?.();
    const problem = validate?.(parsed()) ?? null;
    setError(problem);
    if (problem) return;
    if (confirm && !changes) {
      const p = parsed();
      const diff = fields
        .filter((f) => show(f, p[f.name]) !== show(f, init[f.name]))
        .map((f) => ({ field: f.label, from: show(f, init[f.name]), to: show(f, p[f.name]) }));
      if (!diff.length) return onClose();
      setChanges(diff);
      return;
    }
    onSubmit(parsed());
  };

  const startDelete = () => {
    if (!(confirmDelete ?? confirm)) return onDelete?.();
    const summary = fields
      .filter((f) => f.type !== "toggle" && f.type !== "textarea")
      .map((f) => show(f, init[f.name]))
      .filter(Boolean)
      .join(" · ");
    setDeleting(true);
    setChanges([{ field: "Entry", from: summary, to: "Deleted" }]);
  };

  return (
    <Sheet title={deleting ? "Confirm delete" : changes ? "Confirm changes" : title} onClose={onClose}>
      <form onSubmit={submit}>
        {changes ? (
          <ChangeList changes={changes} />
        ) : (
          <div className="form">
            {fields.map((f) => (
              <label key={f.name} className={`field${f.full || f.type === "text" || f.type === "textarea" || f.type === "toggle" ? " full" : ""}`}>
                <span className="field-label">
                  <span className="label">{f.label}</span>
                  {f.badge && <span className="inf">{f.badge}</span>}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    className="input"
                    value={vals[f.name] as string}
                    placeholder={f.placeholder}
                    onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
                  />
                ) : f.type === "select" ? (
                  <select className="input" value={vals[f.name] as string} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>
                    {f.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "toggle" ? (
                  <span className="toggle">
                    <span className="muted">{vals[f.name] ? "Yes" : "No"}</span>
                    <button
                      type="button"
                      role="switch"
                      className="switch"
                      aria-checked={Boolean(vals[f.name])}
                      onClick={() => setVals({ ...vals, [f.name]: !vals[f.name] })}
                    />
                  </span>
                ) : (
                  <input
                    className="input num"
                    type={f.type === "number" ? "text" : f.type ?? "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    step={f.step}
                    value={vals[f.name] as string}
                    placeholder={f.placeholder}
                    onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
        )}
        {error && !changes && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: "var(--s-3) 0 0" }}>
            {error}
          </p>
        )}
        <div className="sheet-actions">
          {changes ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setChanges(null);
                  setDeleting(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Confirm
              </button>
            </>
          ) : (
            <>
              {onDelete && (
                <button type="button" className="btn btn-ghost" style={{ color: "var(--danger)", flex: "none" }} onClick={startDelete}>
                  Delete
                </button>
              )}
              <button type="submit" className="btn btn-primary">
                {submitLabel}
              </button>
            </>
          )}
        </div>
      </form>
    </Sheet>
  );
}
