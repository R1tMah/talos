import { addDays, fmtDay, logicalToday, weekStart } from "@/lib/date";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/** Last N weeks, Monday first, newest week at the bottom, with lifts per week. */
export function LiftCalendar({ dates, weeks = 8 }: { dates: string[]; weeks?: number }) {
  const today = logicalToday();
  const days = new Set(dates);
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
            ...dates.map((d) => (
              <span
                key={d}
                className={`cal-day${days.has(d) ? " on" : ""}${d === today ? " today" : ""}${d > today ? " future" : ""}`}
                title={fmtDay(d)}
              />
            )),
            <span key={`${ws}-n`} className={`cal-count${n ? "" : " zero"}`}>
              {n}
            </span>,
          ];
        })}
      </div>
    </div>
  );
}
