"use client";

import { useEffect, useRef, useState } from "react";
import { breakEnd, fmtRange } from "@/lib/breaks";
import { addDays, daysBetween, fmtDay, todayISO } from "@/lib/date";
import type { WeekRow } from "@/lib/stats";
import type { Break, Phase } from "@/lib/types";

const H = 200;
const PAD = { t: 18, r: 34, b: 26, l: 4 };

/**
 * Weekly averages over phase bands. Breaks are thinner bands on top, placed by
 * day. Days with a note get a dot on the baseline.
 */
export function WeightChart({
  weeks, phases, breaks, noteDays,
}: {
  weeks: WeekRow[];
  phases: Phase[];
  breaks: Break[];
  noteDays: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [sel, setSel] = useState<number | null>(null);
  const [brk, setBrk] = useState<Break | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = [...weeks].reverse(); // oldest first
  if (pts.length < 2) {
    return (
      <div ref={ref} className="card chart">
        <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
          Two weeks of data needed for a chart.
        </span>
      </div>
    );
  }

  const d0 = pts[0].week;
  const d1 = addDays(pts[pts.length - 1].week, 6);
  const span = daysBetween(d0, d1);
  const x = (d: string) => PAD.l + (daysBetween(d0, d) / span) * (w - PAD.l - PAD.r);

  const vals = pts.map((p) => p.avg);
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, (lo + hi) / 2, hi];

  const px = pts.map((p) => ({ ...p, cx: x(addDays(p.week, 3)), cy: y(p.avg) }));
  const path = px.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join("");
  const active = sel ?? px.length - 1;
  const a = px[active];

  // Break bands in pixels, clipped to the chart's date range.
  const today = todayISO();
  const bands = breaks
    .map((b) => {
      const s = b.start < d0 ? d0 : b.start;
      const e = breakEnd(b, today) > d1 ? d1 : breakEnd(b, today);
      return s > e ? null : { b, x0: x(s), x1: x(addDays(e, 1)) };
    })
    .filter((v): v is { b: Break; x0: number; x1: number } => v !== null);
  const breakAt = (mx: number) => bands.find((v) => mx >= v.x0 - 4 && mx <= v.x1 + 4)?.b ?? null;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    setBrk(breakAt(mx));
    let best = 0;
    px.forEach((p, i) => {
      if (Math.abs(p.cx - mx) < Math.abs(px[best].cx - mx)) best = i;
    });
    setSel(best);
  };

  return (
    <div ref={ref} className="card chart">
      <div className="chart-head">
        <span className="label">Weekly average</span>
        <span className="num" style={{ fontSize: "var(--t-sm)" }}>
          <span className="faint">Week of {fmtDay(a.week)} </span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>{a.avg.toFixed(1)}</span>
          <span className="faint"> lb</span>
        </span>
      </div>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        onPointerDown={pick}
        // Mouse: hover selects. Touch: tap or drag (a finger has no hover).
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && pick(e)}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          setSel(null); // back to the latest week
          setBrk(null);
        }}
        role="img"
        aria-label="Weekly average weight chart"
      >
        {phases.map((ph, i) => {
          const s = ph.start < d0 ? d0 : ph.start;
          const e = ph.end > d1 ? d1 : ph.end;
          if (s > e) return null;
          const x0 = x(s);
          const x1 = x(addDays(e, 1));
          return (
            <g key={ph.id}>
              <rect x={x0} y={0} width={Math.max(0, x1 - x0)} height={H - PAD.b} fill={i % 2 ? "var(--band-b)" : "var(--band-a)"} />
              <text x={x0 + 6} y={11} fontSize={10} fill="var(--text-3)" letterSpacing="0.06em">
                {ph.name.toUpperCase()}
              </text>
            </g>
          );
        })}

        {bands.map(({ b, x0, x1 }) => (
          <g key={b.id} className={`break-band${brk?.id === b.id ? " active" : ""}`}>
            <rect x={x0} y={PAD.t - 4} width={Math.max(2, x1 - x0)} height={H - PAD.b - PAD.t + 4} />
            <line x1={x0} x2={x0} y1={PAD.t - 4} y2={H - PAD.b} />
            <line x1={x1} x2={x1} y1={PAD.t - 4} y2={H - PAD.b} />
            <title>{`${b.label} · ${fmtRange(b)}`}</title>
          </g>
        ))}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={w - PAD.r + 6} y={y(t) + 3.5} fontSize={10} fill="var(--text-3)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}

        <line x1={a.cx} x2={a.cx} y1={PAD.t - 4} y2={H - PAD.b} stroke="var(--border-strong)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {px.map((p, i) => (
          <circle
            key={p.week}
            cx={p.cx}
            cy={p.cy}
            r={i === active ? 4 : 2.75}
            fill={i === active ? "var(--accent)" : "var(--surface)"}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray={p.partial && i === px.length - 1 ? "2 1.5" : undefined}
          />
        ))}

        {noteDays
          .filter((d) => d >= d0 && d <= d1)
          .map((d) => (
            <circle key={d} cx={x(d)} cy={H - PAD.b - 4} r={2} fill="var(--text-3)">
              <title>Note, {fmtDay(d)}</title>
            </circle>
          ))}

        {[px[0], px[Math.floor(px.length / 2)], px[px.length - 1]].map((p, i) => (
          <text
            key={p.week}
            x={p.cx}
            y={H - 8}
            fontSize={10}
            fill="var(--text-3)"
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          >
            {fmtDay(p.week)}
          </text>
        ))}
      </svg>
      <div className="chart-break" aria-live="polite">
        {brk && (
          <>
            <span className="break-swatch" />
            <span className="chart-break-label">{brk.label}</span>
            <span className="faint num">{fmtRange(brk)}</span>
          </>
        )}
      </div>
    </div>
  );
}
