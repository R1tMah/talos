"use client";

import { useEffect, useRef, useState } from "react";
import { daysBetween, fmtDay } from "@/lib/date";

export interface LiftPoint {
  date: string;
  value: number;
  detail: string; // e.g. "65 × 6", shown for the selected point
}

const H = 200;
const PAD = { t: 18, r: 34, b: 26, l: 4 };

/** One lift over time, one point per workout day, placed by date. No trend line, no projection. */
export function LiftChart({ points, label, unit }: { points: LiftPoint[]; label: string; unit: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setSel(null), [points]);

  if (points.length === 0) {
    return (
      <div ref={ref} className="card chart">
        <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
          No sets logged for this lift yet.
        </span>
      </div>
    );
  }

  const d0 = points[0].date;
  const span = Math.max(1, daysBetween(d0, points[points.length - 1].date));
  const x = (d: string) => (points.length === 1 ? (w - PAD.r) / 2 : PAD.l + 8 + (daysBetween(d0, d) / span) * (w - PAD.l - PAD.r - 16));
  const vals = points.map((p) => p.value);
  const pad = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.15);
  const lo = Math.floor(Math.min(...vals) - pad);
  const hi = Math.ceil(Math.max(...vals) + pad);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, (lo + hi) / 2, hi];

  const px = points.map((p) => ({ ...p, cx: x(p.date), cy: y(p.value) }));
  const path = px.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join("");
  const active = sel ?? px.length - 1;
  const a = px[active];

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    px.forEach((p, i) => {
      if (Math.abs(p.cx - mx) < Math.abs(px[best].cx - mx)) best = i;
    });
    setSel(best);
  };

  const labels = px.length === 1 ? [px[0]] : [px[0], px[Math.floor(px.length / 2)], px[px.length - 1]];

  return (
    <div ref={ref} className="card chart">
      <div className="chart-head">
        <span className="label">{label}</span>
        <span className="num" style={{ fontSize: "var(--t-sm)" }}>
          <span className="faint">{fmtDay(a.date)} </span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>{Number.isInteger(a.value) ? a.value : a.value.toFixed(1)}</span>
          <span className="faint"> {unit} · {a.detail}</span>
        </span>
      </div>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons && pick(e)}
        role="img"
        aria-label={`${label} chart`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={w - PAD.r + 6} y={y(t) + 3.5} fontSize={10} fill="var(--text-3)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={a.cx} x2={a.cx} y1={PAD.t - 4} y2={H - PAD.b} stroke="var(--border-strong)" />
        {px.length > 1 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {px.map((p, i) => (
          <circle
            key={p.date}
            cx={p.cx}
            cy={p.cy}
            r={i === active ? 4 : 2.75}
            fill={i === active ? "var(--accent)" : "var(--surface)"}
            stroke="var(--accent)"
            strokeWidth={1.5}
          />
        ))}
        {labels.map((p, i) => (
          <text
            key={`${p.date}-${i}`}
            x={p.cx}
            y={H - 8}
            fontSize={10}
            fill="var(--text-3)"
            textAnchor={labels.length === 1 ? "middle" : i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          >
            {fmtDay(p.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
