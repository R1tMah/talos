import type { ReactNode } from "react";
import { sky, skyKind } from "./format";

// Line icons for the weather card, drawn like components/Icons.tsx (24px grid,
// 1.75 stroke, round caps). Clouds are filled with the card surface so a sun or moon
// behind them doesn't show through.

const CLOUD_HIGH = "M7.5 15h9a3.75 3.75 0 0 0 .35-7.48 5.25 5.25 0 0 0-10.1 1.5A3 3 0 0 0 7.5 15Z";
const CLOUD_MID = "M7 18.5h10a4 4 0 0 0 .4-7.98 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 7 18.5Z";
const CLOUD_SMALL = "M10 20h7a3.4 3.4 0 0 0 .3-6.8 4.6 4.6 0 0 0-8.85 1.3A2.8 2.8 0 0 0 10 20Z";

const cloud = (d: string) => <path d={d} fill="var(--surface)" />;
const rays = (cx: number, cy: number, r0: number, r1: number) =>
  [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const rad = (a * Math.PI) / 180;
    return <path key={a} d={`M${cx + r0 * Math.cos(rad)} ${cy + r0 * Math.sin(rad)}L${cx + r1 * Math.cos(rad)} ${cy + r1 * Math.sin(rad)}`} />;
  });
const moon = (scale = 1, dx = 0, dy = 0) => (
  <path transform={`translate(${dx} ${dy}) scale(${scale})`} d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10Z" />
);
const lines = (pts: [number, number][], len = 3) => pts.map(([x, y]) => <path key={`${x},${y}`} d={`M${x} ${y}l-1 ${len}`} />);

function shapes(kind: NonNullable<ReturnType<typeof skyKind>>, night: boolean): ReactNode {
  switch (kind) {
    case "clear":
      return night ? moon() : (<><circle cx="12" cy="12" r="4" />{rays(12, 12, 6.5, 8.5)}</>);
    case "partly":
      return night
        ? (<>{moon(0.62, 1, 1)}{cloud(CLOUD_SMALL)}</>)
        : (<><circle cx="9" cy="9" r="2.75" />{rays(9, 9, 4.5, 5.9)}{cloud(CLOUD_SMALL)}</>);
    case "cloudy":
      return cloud(CLOUD_MID);
    case "fog":
      return (<>{cloud(CLOUD_HIGH)}<path d="M5 18h11M8 21h11" /></>);
    case "drizzle":
      return (<>{cloud(CLOUD_HIGH)}{lines([[9, 18], [13, 18], [17, 18]], 1.5)}</>);
    case "rain":
      return (<>{cloud(CLOUD_HIGH)}{lines([[9, 17.5], [13, 17.5], [17, 17.5]])}</>);
    case "heavy":
      return (<>{cloud(CLOUD_HIGH)}{lines([[8, 17.5], [11.5, 17.5], [15, 17.5], [18.5, 17.5]], 4.5)}</>);
    case "freezing":
      return (
        <>
          {cloud(CLOUD_HIGH)}
          {lines([[8.5, 17.5], [12.5, 17.5]])}
          <path d="M17.5 17.6v3.3M16.07 18.43l2.86 1.64M18.93 18.43l-2.86 1.64" />
        </>
      );
    case "snow":
      return (
        <>
          {cloud(CLOUD_HIGH)}
          <g fill="currentColor" stroke="none">
            <circle cx="8.5" cy="18.25" r="1" />
            <circle cx="12.5" cy="20.5" r="1" />
            <circle cx="16.5" cy="18.25" r="1" />
          </g>
        </>
      );
    case "storm":
      return (<>{cloud(CLOUD_HIGH)}<path d="M12.75 15.5 10.5 19h3l-1.75 3.5" /></>);
  }
}

/** The icon for an Open-Meteo weather code. Labelled with the condition for screen readers. */
export function WeatherIcon({ code, night = false, size = 20 }: { code: number; night?: boolean; size?: number }) {
  const kind = skyKind(code);
  if (!kind) return null;
  return (
    <svg
      className="wx-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={sky(code)}
    >
      {shapes(kind, night)}
    </svg>
  );
}
