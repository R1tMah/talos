"use client";

import { useEffect } from "react";

/**
 * iOS keeps the layout viewport full-height when the keyboard opens, so
 * fixed-bottom UI would sit behind it. Track the visual viewport and expose
 * the keyboard height as --kb, plus `kb-open` on <html> to hide the tab bar.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const root = document.documentElement;
      root.style.setProperty("--kb", `${kb}px`);
      root.classList.toggle("kb-open", kb > 80);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
