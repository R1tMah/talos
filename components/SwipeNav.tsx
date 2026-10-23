"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { NAV_ITEMS } from "./TabBar";

/** Horizontal travel (px) that commits a swipe. */
const COMMIT = 70;
/** A fast flick commits with less travel. */
const FLICK = 0.5; // px per ms
/** Touches this close to a screen edge belong to the OS (back gesture, etc.). */
const EDGE = 20;

// Anything that already owns horizontal drags, or text you might be selecting.
const IGNORE = "input, textarea, select, [contenteditable], [role=dialog], .swipe, svg[role=img], [data-no-swipe], .tabbar";

/** Nearest ancestor that scrolls sideways and still has room in that direction. */
function scrollsX(el: Element | null, dx: number): boolean {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    // Swiping right scrolls toward the start; left toward the end.
    if (dx > 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
  }
  return false;
}

/**
 * Swipe left/right on a main tab (Chat, Workout, Tabs, Watch, Settings) to move to
 * the neighbouring one, in TabBar order. Only on the tab roots: sub-pages keep their
 * own back navigation. The screen follows the finger, then the next one slides in.
 */
export function SwipeNav() {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    const idx = NAV_ITEMS.findIndex((i) => i.href === path);
    if (idx < 0) return;
    const prev = NAV_ITEMS[idx - 1]?.href;
    const next = NAV_ITEMS[idx + 1]?.href;
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);

    let s: { x: number; y: number; t: number; target: Element; axis?: "x" | "y"; main: HTMLElement | null } | null = null;
    let dx = 0;

    const reset = (main: HTMLElement | null) => {
      if (!main) return;
      main.style.transition = "transform 200ms var(--ease), opacity 200ms var(--ease)";
      main.style.transform = "";
      main.style.opacity = "";
      setTimeout(() => (main.style.transition = ""), 220);
    };

    const onStart = (e: TouchEvent) => {
      s = null;
      dx = 0;
      if (e.touches.length !== 1 || document.documentElement.classList.contains("kb-open")) return;
      const t = e.touches[0];
      const target = e.target as Element;
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE || target.closest?.(IGNORE)) return;
      s = { x: t.clientX, y: t.clientY, t: e.timeStamp, target, main: document.querySelector<HTMLElement>("body main") };
    };

    const onMove = (e: TouchEvent) => {
      if (!s) return;
      const t = e.touches[0];
      const mx = t.clientX - s.x;
      const my = t.clientY - s.y;
      if (!s.axis) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        // Clearly horizontal, toward a tab that exists, and not inside a scroller that wants it.
        const horiz = Math.abs(mx) > Math.abs(my) * 1.5;
        const dest = mx < 0 ? next : prev;
        if (!horiz || !dest || scrollsX(s.target, mx) || window.getSelection()?.toString()) {
          s = null;
          return;
        }
        s.axis = "x";
      }
      e.preventDefault(); // keep the page from scrolling vertically mid-swipe
      dx = mx;
      if (s.main) {
        s.main.style.transition = "";
        s.main.style.transform = `translateX(${dx * 0.35}px)`;
        s.main.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, 0.35));
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!s?.axis) {
        s = null;
        return;
      }
      const { main, t } = s;
      s = null;
      const fast = Math.abs(dx) / Math.max(e.timeStamp - t, 1) > FLICK && Math.abs(dx) > 30;
      const dest = dx < 0 ? next : prev;
      if (!dest || (Math.abs(dx) < COMMIT && !fast)) return reset(main);
      // The incoming screen reads this to slide in from the side you swiped toward.
      document.documentElement.dataset.swipe = dx < 0 ? "next" : "prev";
      setTimeout(() => delete document.documentElement.dataset.swipe, 400);
      router.push(dest);
    };

    const onCancel = () => {
      if (s?.axis) reset(s.main);
      s = null;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [path, router]);

  return null;
}
