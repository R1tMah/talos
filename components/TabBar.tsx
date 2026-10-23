"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtClock } from "@/lib/date";
import { FLAGS } from "@/lib/flags";
import { useWorkoutClock } from "@/lib/workoutClock";
import { IconChat, IconDumbbell, IconEye, IconGrid, IconSliders } from "./Icons";

const ITEMS = [
  { href: "/", label: "Chat", Icon: IconChat, match: (p: string) => p === "/", primary: true },
  { href: "/workout", label: "Workout", Icon: IconDumbbell, match: (p: string) => p.startsWith("/workout") },
  { href: "/tabs", label: "Tabs", Icon: IconGrid, match: (p: string) => p.startsWith("/tabs") },
  { href: "/watch", label: "Watch", Icon: IconEye, match: (p: string) => p.startsWith("/watch") },
  { href: "/settings", label: "Settings", Icon: IconSliders, match: (p: string) => p.startsWith("/settings") },
].filter((i) => i.href !== "/workout" || FLAGS.workout);

/** Elapsed time from the stored start timestamp; the interval only triggers re-renders. */
function useElapsed(startedAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt == null ? null : fmtClock((now - startedAt) / 1000);
}

export function TabBar() {
  const path = usePathname();
  const elapsed = useElapsed(useWorkoutClock().startedAt ?? undefined);

  if (path === "/login") return null;

  return (
    <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${ITEMS.length}, 1fr)` }}>
      {ITEMS.map(({ href, label, Icon, match, primary }) => {
        const live = href === "/workout" && elapsed != null;
        return (
          <Link
            key={href}
            href={href}
            className={`${primary ? "primary" : ""}${live ? " live" : ""}`}
            aria-current={match(path) ? "page" : undefined}
            aria-label={live ? `Workout in progress, ${elapsed}` : undefined}
          >
            <span className="tab-icon">
              <Icon size={22} />
              {live && <span className="tab-dot" />}
            </span>
            <span className={`tab-label${live ? " num" : ""}`}>{live ? elapsed : label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
