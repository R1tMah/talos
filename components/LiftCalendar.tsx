import { addDays, fmtDay, logicalToday, weekStart } from "@/lib/date";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Last N weeks, Monday first, newest week at the bottom, with lifts per week.
 * A day with a workout opens it (the latest one, if there were two that day).
 */
export function LiftCalendar({
  workouts, weeks = 8, onPick,
}: {
  workouts: { id: string; date: string }[]; // newest first
  weeks?: number;
  onPick?: (id: string) => void;
}) {
  const today = logicalToday();
  const byDate = new Map<string, string>();
  for (const w of workouts) if (!byDate.has(w.date)) byDate.set(w.date, w.id);
  const days = new Set(byDate.keys());
  const first = addDays(weekStart(today), -7 * (weeks - 1));

  return (
    <div className="card pad">
      <div className="cal num" role="table" aria-label="Lifting calendar">
        <span />
        {DOW.map((d, i) => (
          <span key={i} className="cal-head">
            {d}
          </span>
        ))}
        <span className="cal-head" style={{ textAlign: "right" }}>
          Wk
        </span>
        {Array.from({ length: weeks }, (_, w) => {
          const ws = addDays(first, 7 * w);
          const dates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
          const n = dates.filter((d) => days.has(d)).length;
          return [
            <span key={`${ws}-l`} className="cal-week">
              {fmtDay(ws)}
            </span>,
            ...dates.map((d) => {
              const cls = `cal-day${days.has(d) ? " on" : ""}${d === today ? " today" : ""}${d > today ? " future" : ""}`;
              const id = byDate.get(d);
              return id && onPick ? (
                <button key={d} type="button" className={cls} title={fmtDay(d)} aria-label={`Workout ${fmtDay(d)}`} onClick={() => onPick(id)} />
              ) : (
                <span key={d} className={cls} title={fmtDay(d)} />
              );
            }),
            <span key={`${ws}-n`} className={`cal-count${n ? "" : " zero"}`}>
              {n}
            </span>,
          ];
        })}
      </div>
    </div>
  );
}
