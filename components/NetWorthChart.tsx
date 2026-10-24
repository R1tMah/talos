"use client";

import { useEffect, useRef, useState } from "react";
import { daysBetween, fmtDay } from "@/lib/date";
import { fmtMoney, type Snapshot } from "@/lib/finances";

const H = 160;
const PAD = { t: 14, r: 52, b: 24, l: 4 };

/**
 * Net worth from the daily snapshots TALOS saves (checking + Vanguard). One line,
 * so no legend; the head shows the picked day's value. Hover or tap to pick a day.
 */
export function NetWorthChart({ snapshots }: { snapshots: Snapshot[] }) {
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

  if (snapshots.length < 2) {
    return (
      <div ref={ref} className="card chart">
        <div className="chart-head">
          <span className="label">Net worth</span>
        </div>
        <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
          TALOS saves a snapshot each night. The line appears after two days.
        </span>
      </div>
    );
  }

  const d0 = snapshots[0].date;
  const span = Math.max(1, daysBetween(d0, snapshots[snapshots.length - 1].date));
  const x = (d: string) => PAD.l + (daysBetween(d0, d) / span) * (w - PAD.l - PAD.r);
  const vals = snapshots.map((s) => s.total);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1) (lo -= 50), (hi += 50); // a flat line still sits mid-chart
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];

  const px = snapshots.map((s) => ({ ...s, cx: x(s.date), cy: y(s.total) }));
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

  return (
    <div ref={ref} className="card chart">
      <div className="chart-head">
        <span className="label">Net worth</span>
        <span className="num" style={{ fontSize: "var(--t-sm)" }}>
          <span className="faint">{fmtDay(a.date)} </span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>{fmtMoney(a.total)}</span>
        </span>
      </div>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        onPointerDown={pick}
        // Mouse: hover selects. Touch: tap or drag (a finger has no hover).
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && pick(e)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}
        role="img"
        aria-label={`Net worth over ${snapshots.length} days, now ${fmtMoney(snapshots[snapshots.length - 1].total)}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={w - PAD.r + 6} y={y(t) + 3.5} fontSize={10} fill="var(--text-3)">
              {fmtMoney(t, { cents: false })}
            </text>
          </g>
        ))}
        <line x1={a.cx} x2={a.cx} y1={PAD.t - 4} y2={H - PAD.b} stroke="var(--border-strong)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={a.cx} cy={a.cy} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {[px[0], px[px.length - 1]].map((p, i) => (
          <text key={p.date} x={p.cx} y={H - 8} fontSize={10} fill="var(--text-3)" textAnchor={i === 0 ? "start" : "end"}>
            {fmtDay(p.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}
