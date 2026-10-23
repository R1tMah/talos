"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconBack, IconPlus } from "./Icons";

export function ScreenHeader({ title, back, right, brand }: { title: string; back?: string; right?: ReactNode; /** Soft pink wordmark instead of metal. */ brand?: boolean }) {
  return (
    <header className="header">
      {back && (
        <Link href={back} className="back" aria-label="Back">
          <IconBack />
        </Link>
      )}
      {/* Balances a right-side control so a centered wordmark stays centered. */}
      {brand && right && !back && <span className="header-spacer" aria-hidden />}
      <h1 className={brand ? "brand" : undefined}>{title}</h1>
      {right}
    </header>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-title">
      <span className="label">{children}</span>
      {right}
    </div>
  );
}

export function Fab({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label}>
      <IconPlus size={24} />
    </button>
  );
}

export function EmptyState({ text, onAdd }: { text: string; onAdd?: () => void }) {
  return (
    <div className="empty">
      <span>{text}</span>
      {onAdd && (
        <button type="button" className="btn btn-sm" onClick={onAdd}>
          <IconPlus size={14} /> Add
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES: Record<string, string> = {
  Easy: "tag-1", Medium: "tag-2", Hard: "tag-3",
  typed: "", saved: "tag-1", estimate: "tag-outline",
};

export function Tag({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`tag ${tone ?? TONES[String(children)] ?? ""}`}>{children}</span>;
}

const STATUS_DOTS: Record<string, string> = {
  Applied: "var(--text-3)",
  OA: "var(--tag-2)",
  "OA Stage": "var(--tag-2)",
  Interview: "var(--accent)",
  Offer: "var(--tag-1)",
  Rejected: "var(--border-strong)",
  "No response": "var(--border-strong)",
  Scheduled: "var(--tag-2)",
  Completed: "var(--text-3)",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="pill" style={{ "--dot": STATUS_DOTS[status] ?? "var(--text-3)" } as React.CSSProperties}>
      {status}
    </span>
  );
}

/** − value + control. Visually compact, 44px tap targets. */
export function Stepper({
  value, min = 0, max = Infinity, step = 1, onChange, label,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const fmt = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" className="btn btn-sm" aria-label={`Fewer ${label}`} disabled={value - step < min - 1e-9} onClick={() => onChange(+(value - step).toFixed(2))}>
        −
      </button>
      <span className="stepper-value num" aria-live="polite">
        {fmt}
      </span>
      <button type="button" className="btn btn-sm" aria-label={`More ${label}`} disabled={value + step > max + 1e-9} onClick={() => onChange(+(value + step).toFixed(2))}>
        +
      </button>
    </span>
  );
}
