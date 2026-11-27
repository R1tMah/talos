"use client";

import { useEffect, useRef, useState } from "react";
import { breakEnd, fmtRange } from "@/lib/breaks";
import { addDays, daysBetween, fmtDay, todayISO } from "@/lib/date";
import type { WeekRow } from "@/lib/stats";
import type { Break, Phase } from "@/lib/types";

const H = 200;
const PAD = { t: 18, r: 34, b: 26, l: 4 };
// Label sizes for 10px text: a rough average glyph width (uppercase phase names also get
// 0.06em letter spacing), so labels can be placed without measuring the DOM.
const PHASE_CH = 7;
const DATE_W = 40; // "Sep 30"
const GAP = 6;

/**
 * Phase names that fit: each inside its own band (from 6px in) and clear of the previous
 * name. A name too long for its band falls back to its first word ("2250 cal" → "2250");
 * if that doesn't fit either, the phase goes unlabeled here, and the header names the
 * selected week's phase.
 */
export function placePhaseLabels(bands: { id: string; name: string; x0: number; x1: number }[], right: number) {
  const out: { id: string; name: string; x: number }[] = [];
  let lastEnd = -Infinity;
  for (const b of [...bands].sort((p, q) => p.x0 - q.x0)) {
    const x = b.x0 + GAP;
    if (x < lastEnd + GAP) continue;
    const full = b.name.trim().toUpperCase();
    const name = [full, full.split(/\s+/)[0]].find((n) => n && x + n.length * PHASE_CH <= Math.min(b.x1, right) - 2);
    if (!name) continue;
    out.push({ id: b.id, name, x });
    lastEnd = x + name.length * PHASE_CH;
  }
  return out;
}

/**
 * Which points get a date under the axis: up to one per ~70px, evenly spread, never two
 * that touch. The first is drawn rightward from its point, the last leftward, the rest
 * centred; if the first and last would touch, only the last (the newest) is kept.
 */
export function dateLabelIndexes(xs: number[], width: number) {
  const n = xs.length;
  if (n < 2) return n ? [0] : [];
  const span = (i: number): [number, number] =>
    i === 0 ? [xs[i], xs[i] + DATE_W] : i === n - 1 ? [xs[i] - DATE_W, xs[i]] : [xs[i] - DATE_W / 2, xs[i] + DATE_W / 2];
  const clear = (i: number, kept: number[]) => kept.every((k) => span(i)[0] >= span(k)[1] + GAP || span(k)[0] >= span(i)[1] + GAP);

  const kept = clear(0, [n - 1]) ? [0, n - 1] : [n - 1];
  const want = Math.max(2, Math.min(6, Math.floor(width / (DATE_W * 1.75))));
  for (let j = 1; j < want - 1; j++) {
    const i = Math.round((j * (n - 1)) / (want - 1));
    if (!kept.includes(i) && clear(i, kept)) kept.push(i);
  }
  return kept.sort((p, q) => p - q);
}

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
  const mid = addDays(a.week, 3);
  const activePhase = phases.find((ph) => ph.start <= mid && mid <= ph.end && ph.name);

  // Break bands in pixels, clipped to the chart's date range.
  const today = todayISO();
  const bands = breaks
    .map((b) => {
      const s = b.start < d0 ? d0 : b.start;
      const e = breakEnd(b, today) > d1 ? d1 : breakEnd(b, today);
      return s > e ? null : { b, x0: x(s), x1: x(addDays(e, 1)) };
    })
    .filter((v): v is { b: Break; x0: number; x1: number } => v !== null);
  // Phase bands in pixels, clipped the same way; `i` keeps the alternating shade.
  const phaseBands = phases
    .map((ph, i) => {
      const s = ph.start < d0 ? d0 : ph.start;
      const e = ph.end > d1 ? d1 : ph.end;
      return s > e ? null : { id: ph.id, name: ph.name, x0: x(s), x1: x(addDays(e, 1)), i };
    })
    .filter((v): v is { id: string; name: string; x0: number; x1: number; i: number } => v !== null);

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
          <span className="faint">
            Week of {fmtDay(a.week)}
            {activePhase && ` · ${activePhase.name}`}{" "}
          </span>
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
        {phaseBands.map(({ id, x0, x1, i }) => (
          <rect key={id} x={x0} y={0} width={Math.max(0, x1 - x0)} height={H - PAD.b} fill={i % 2 ? "var(--band-b)" : "var(--band-a)"} />
        ))}
        {placePhaseLabels(phaseBands, w - PAD.r).map((l) => (
          <text key={l.id} x={l.x} y={11} fontSize={10} fill="var(--text-3)" letterSpacing="0.06em">
            {l.name}
          </text>
        ))}

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

        {dateLabelIndexes(px.map((p) => p.cx), w - PAD.l - PAD.r).map((i) => (
          <text
            key={px[i].week}
            x={px[i].cx}
            y={H - 8}
            fontSize={10}
            fill="var(--text-3)"
            textAnchor={i === 0 ? "start" : i === px.length - 1 ? "end" : "middle"}
          >
            {fmtDay(px[i].week)}
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
