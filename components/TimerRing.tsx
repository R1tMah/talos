"use client";

import { useEffect, useRef, useState } from "react";
import { fmtClock } from "@/lib/date";

/**
 * Circular countdown. `onDone` fires once when a running countdown reaches
 * zero (not when mounted with an already-expired end time).
 */
export function TimerRing({
  endsAt, total, size = 220, onDone, label = "Rest",
}: {
  endsAt: number | null;
  total: number;
  size?: number;
  onDone?: () => void;
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const armed = useRef(false);

  useEffect(() => {
    setDone(false);
    if (endsAt == null) return;
    armed.current = endsAt > Date.now();
    const id = setInterval(() => setNow(Date.now()), 200);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt == null ? total * 1000 : Math.max(0, endsAt - now);

  useEffect(() => {
    if (endsAt != null && remaining === 0 && armed.current) {
      armed.current = false;
      setDone(true);
      onDone?.();
    }
  }, [remaining, endsAt, onDone]);

  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = endsAt == null ? 1 : remaining / Math.max(1, total * 1000);
  const state = endsAt == null ? "idle" : done ? "done" : "running";

  return (
    <div className={`ring ${state}`} style={{ width: size, height: size }} role="timer" aria-label={`${label} ${fmtClock(remaining / 1000)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        {state !== "idle" && (
          <circle
            className="ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
          />
        )}
      </svg>
      <div className="ring-center">
        <span className="ring-time num">{fmtClock(Math.ceil(remaining / 1000))}</span>
        <span className="label">{state === "idle" ? `${label}, ready` : label}</span>
      </div>
    </div>
  );
}
