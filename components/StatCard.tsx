import Link from "next/link";
import type { ReactNode } from "react";

export interface StatRow {
  label: string;
  value: ReactNode;
}

export function StatCard({
  title, href, value, unit, rows = [], span, accent,
}: {
  title: string;
  href: string;
  value: ReactNode;
  unit?: string;
  rows?: StatRow[];
  span?: 2;
  accent?: boolean;
}) {
  return (
    <Link href={href} className={`card stat${span === 2 ? " span-2" : ""}`}>
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
    </Link>
  );
}

export interface StripItem {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
}

/** Horizontal summary at the top of each data tab. */
export function SummaryStrip({ items }: { items: StripItem[] }) {
  return (
    <div className="card strip">
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
