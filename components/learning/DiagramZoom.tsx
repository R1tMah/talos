"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@/components/Icons";

const MIN = 1;
const MAX = 6;
const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));

/**
 * Full-screen viewer for a rendered diagram. Zoom with pinch (touch), Ctrl/⌘ + scroll or
 * trackpad pinch, double-tap/double-click, or the buttons; pan by scrolling or dragging.
 * Zooming keeps the point under the fingers (or the centre, for buttons) in place.
 */
export function DiagramZoom({ svg, caption, onClose }: { svg: string; caption?: string | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Where to keep fixed while zooming: a point in content coordinates and where it sits in the box.
  const anchor = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomTo(scaleRef.current * 1.25);
      if (e.key === "-") zoomTo(scaleRef.current / 1.25);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // zoomTo reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  /** Zooms to `next`, keeping the box point (vx, vy) over the same spot of the diagram. */
  const zoomTo = (next: number, vx?: number, vy?: number) => {
    const el = box.current;
    if (!el) return;
    const s = clamp(next);
    const px = vx ?? el.clientWidth / 2;
    const py = vy ?? el.clientHeight / 2;
    anchor.current = { cx: (el.scrollLeft + px) / scaleRef.current, cy: (el.scrollTop + py) / scaleRef.current, vx: px, vy: py };
    setScale(s);
  };

  // After a zoom renders, scroll so the anchored point is back under the fingers.
  useLayoutEffect(() => {
    const el = box.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.cx * scale - a.vx;
    el.scrollTop = a.cy * scale - a.vy;
    anchor.current = null;
  }, [scale]);

  // Ctrl/⌘ + wheel (also what trackpad pinch sends). Not passive, so the page doesn't zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(scaleRef.current * Math.exp(-e.deltaY / 200), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t: React.TouchList) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
  };

  const toggleAt = (x: number, y: number) => zoomTo(scaleRef.current > 1.05 ? 1 : 2.5, x, y);

  return createPortal(
    <div className="dz" role="dialog" aria-modal aria-label="Diagram">
      <div className="dz-bar">
        <button type="button" className="icon-btn" onClick={() => zoomTo(scale / 1.4)} aria-label="Zoom out" disabled={scale <= MIN}>−</button>
        <button type="button" className="btn btn-sm dz-pct" onClick={() => zoomTo(1)} aria-label="Fit to screen">{Math.round(scale * 100)}%</button>
        <button type="button" className="icon-btn" onClick={() => zoomTo(scale * 1.4)} aria-label="Zoom in" disabled={scale >= MAX}>+</button>
        <span className="dz-spacer" />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX />
        </button>
      </div>
      <div
        ref={box}
        className="dz-box"
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = { d: dist(e.touches), s: scaleRef.current };
          else if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              const r = box.current!.getBoundingClientRect();
              toggleAt(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
              lastTap.current = 0;
            } else lastTap.current = now;
          }
        }}
        onTouchMove={(e) => {
          // The box's touch-action (pan only) keeps the browser from zooming the page instead.
          if (e.touches.length !== 2 || !pinch.current) return;
          const m = mid(e.touches);
          zoomTo((pinch.current.s * dist(e.touches)) / pinch.current.d, m.x, m.y);
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinch.current = null;
        }}
        onDoubleClick={(e) => {
          const r = box.current!.getBoundingClientRect();
          toggleAt(e.clientX - r.left, e.clientY - r.top);
        }}
        onMouseDown={(e) => {
          const el = box.current!;
          drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
        }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (!d || e.buttons !== 1) return;
          box.current!.scrollLeft = d.sl - (e.clientX - d.x);
          box.current!.scrollTop = d.st - (e.clientY - d.y);
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      >
        {/* Mermaid's output under securityLevel "strict" (sanitized SVG). */}
        <div className="dz-content" style={{ width: `${scale * 100}%` }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {caption && <p className="dz-caption faint">{caption}</p>}
      <p className="dz-hint faint">Pinch, double-tap or use + / − to zoom · drag to move</p>
    </div>,
    document.body,
  );
}
