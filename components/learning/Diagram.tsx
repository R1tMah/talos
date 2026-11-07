"use client";

import { useEffect, useId, useState } from "react";
import { DiagramZoom } from "./DiagramZoom";

// Mermaid is large; it's loaded only when a diagram is on screen.
let loader: Promise<typeof import("mermaid").default> | null = null;
const loadMermaid = () => (loader ??= import("mermaid").then((m) => m.default));

const isDark = () =>
  document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

/**
 * A Mermaid diagram written by the Architect. Rendered with Mermaid's strict security
 * level (no scripts, no HTML labels). If it doesn't parse, says so in one line instead of
 * breaking the lesson; the bullets beside it still carry the concept.
 */
export function Diagram({ source, caption }: { source: string; caption?: string | null }) {
  const id = `d${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "neutral", fontFamily: "inherit" });
        const out = await mermaid.render(id, source);
        if (live) setSvg(out.svg);
      } catch {
        if (live) setFailed(true);
        // Mermaid leaves its error graphic in the page on a failed render.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
      }
    })();
    return () => {
      live = false;
    };
  }, [id, source]);

  return (
    <figure className="lesson-diagram">
      {svg ? (
        <button type="button" className="lesson-diagram-open" onClick={() => setZoomed(true)} aria-label="Open the diagram full screen to zoom">
          {/* Mermaid's output under securityLevel "strict" (sanitized SVG). */}
          <div className="lesson-diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          <span className="lesson-diagram-zoom">Tap to zoom</span>
        </button>
      ) : failed ? (
        <p className="faint lesson-diagram-failed">This diagram couldn&apos;t be drawn. The points below cover the same idea.</p>
      ) : (
        <div className="lesson-diagram-loading" aria-label="Loading diagram" />
      )}
      {caption && <figcaption className="faint">{caption}</figcaption>}
      {zoomed && svg && <DiagramZoom svg={svg} caption={caption} onClose={() => setZoomed(false)} />}
    </figure>
  );
}
