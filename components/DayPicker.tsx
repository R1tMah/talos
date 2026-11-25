"use client";

// The week day bar (Nutrition, Chess): the Monday-start week of the selected date, with
// arrows to the previous and next week. Future days are disabled, and so is the next arrow
// once the next week starts after today. A dot marks the days in `has`.

import { IconBack, IconChevron } from "@/components/Icons";
import { addDays, fmtDow, fromISO, weekStart } from "@/lib/date";

export function DayPicker({
  date, today, onChange, has, min,
}: {
  /** The selected day, "YYYY-MM-DD". */
  date: string;
  /** The app's today (logicalToday()); later days can't be picked. */
  today: string;
  onChange: (date: string) => void;
  /** Days that get a dot (days with data). */
  has: Set<string>;
  /** Optional earliest week start: the previous arrow is disabled once that week would start before it. */
  min?: string;
}) {
  const ws = weekStart(date);
  const prevOff = min != null && addDays(ws, -7) < min;
  const nextOff = addDays(ws, 7) > today;
  return (
    <div className="daypicker">
      <button
        type="button"
        className="icon-btn"
        aria-label="Previous week"
        disabled={prevOff}
        style={prevOff ? { opacity: 0.3 } : undefined}
        onClick={() => onChange(addDays(date, -7))}
      >
        <IconBack size={18} />
      </button>
      <div className="days">
        {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => (
          <button
            key={d}
            type="button"
            className={`day num${has.has(d) ? " has" : ""}`}
            aria-pressed={d === date}
            disabled={d > today}
            onClick={() => onChange(d)}
          >
            <small>{fmtDow(d).slice(0, 1)}</small>
            <b>{fromISO(d).getDate()}</b>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next week"
        disabled={nextOff}
        style={{ opacity: nextOff ? 0.3 : 1 }}
        onClick={() => onChange(addDays(date, 7) > today ? today : addDays(date, 7))}
      >
        <IconChevron width={18} height={18} />
      </button>
    </div>
  );
}
