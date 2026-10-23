import { useId } from "react";

export type TalosState = "idle" | "thinking" | "speaking";

/**
 * Talos as a small hologram: a wireframe bust inside a HUD ring, drawn in SVG and
 * animated with CSS (see .holo in globals.css). Idle drifts and glows; thinking spins
 * the ring and brightens; speaking flashes once. Colors come from the theme tokens,
 * so it reads in light and dark mode. Decorative: hidden from screen readers.
 */
export function TalosAvatar({ state = "idle", size = 36 }: { state?: TalosState; size?: number }) {
  const id = useId().replace(/:/g, "");
  const clip = `holo-clip-${id}`;
  const glow = `holo-glow-${id}`;
  return (
    <svg className={`holo holo-${state}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="29" />
        </clipPath>
        <radialGradient id={glow} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Backdrop glow and HUD rings */}
      <circle cx="32" cy="32" r="30" fill={`url(#${glow})`} className="holo-aura" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="var(--accent-line)" strokeWidth="1" />
      <g className="holo-ring">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="14 6 3 6" strokeLinecap="round" />
        <circle cx="32" cy="5" r="1.4" fill="var(--warn)" />
      </g>

      <g clipPath={`url(#${clip})`}>
        {/* Bust: shoulders, neck, head, in wireframe */}
        <g className="holo-figure" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.1" strokeLinejoin="round">
          <path d="M8 64 C10 50 20 45 32 45 C44 45 54 50 56 64 Z" />
          <path d="M27 38 L27 46 L37 46 L37 38" />
          <ellipse cx="32" cy="26" rx="9.5" ry="12" />
        </g>
        {/* Circuit traces in the warm accent */}
        <g fill="none" stroke="var(--warn)" strokeWidth="0.9" strokeLinecap="round" opacity="0.85">
          <path d="M32 47 L32 53 L38 57" />
          <path d="M22 52 L26 55 L26 60" />
          <path d="M42 51 L46 54" />
          <path d="M25 22 C27 19 30 18 32 18" />
        </g>
        {/* Eyes */}
        <g className="holo-eyes" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M27.5 26 L30 26" />
          <path d="M34 26 L36.5 26" />
        </g>
        {/* Scanline */}
        <rect className="holo-scan" x="0" y="0" width="64" height="3" fill="var(--accent)" opacity="0.18" />
      </g>

      {/* Drifting particles */}
      <g fill="var(--accent)">
        <circle className="holo-dot" cx="12" cy="20" r="0.9" />
        <circle className="holo-dot holo-dot-2" cx="52" cy="16" r="0.8" />
        <circle className="holo-dot holo-dot-3" cx="49" cy="40" r="0.7" />
        <circle className="holo-dot holo-dot-2" cx="15" cy="42" r="0.7" />
      </g>
    </svg>
  );
}
