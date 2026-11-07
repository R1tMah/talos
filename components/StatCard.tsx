import Link from "next/link";
import type { ReactNode } from "react";

export interface StatRow {
  label: string;
  value: ReactNode;
}

export function StatCard({
  title, href, value, unit, rows = [], span, accent, compact,
}: {
  title: string;
  /** Omit for a display-only card that doesn't navigate. */
  href?: string;
  value: ReactNode;
  unit?: string;
  rows?: StatRow[];
  span?: 2;
  accent?: boolean;
  /** Shorter card for secondary screens. */
  compact?: boolean;
}) {
  const className = `card stat${span === 2 ? " span-2" : ""}${compact ? " compact" : ""}${href ? "" : " static"}`;
  const body = (
    <>
      <span className="label">{title}</span>
      <span className={`stat-value num${accent ? " accent" : ""}`}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {rows.length > 0 && (
        <span className="stat-rows">
          {rows.map((r) => (
            <span key={r.label} className="stat-row num">
              <span>{r.label}</span>
              <span>{r.value}</span>
            </span>
          ))}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export interface StripItem {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
}

/** Horizontal summary at the top of each data tab; `grid` lays four out as 2×2 boxes instead, so nothing scrolls. */
export function SummaryStrip({ items, grid }: { items: StripItem[]; grid?: boolean }) {
  return (
    <div className={grid ? "card strip strip-grid" : "card strip"}>
      {items.map((it) => (
        <div key={it.label}>
          <span className="label">{it.label}</span>
          <span className="strip-value num">
            {it.value}
            {it.unit && <small>{it.unit}</small>}
          </span>
          {it.sub != null && <span className="strip-sub num">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}
