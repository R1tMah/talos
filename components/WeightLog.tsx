"use client";

import { fmtRange } from "@/lib/breaks";
import { fmtDay, fmtDow } from "@/lib/date";
import type { Break, WeightEntry } from "@/lib/types";
import type { LogItem, WeekLine, WeightNote } from "@/lib/weightLog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Aug 24–30" or "Sep 28–Oct 4". */
function weekRange(start: string, end: string) {
  const [, sm] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  return sm === em ? `${fmtDay(start)}–${ed}` : `${fmtDay(start)}–${MONTHS[em - 1]} ${ed}`;
}

const row: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 12, width: "100%", textAlign: "left", padding: "8px 0" };
const text: React.CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

interface Handlers {
  onDay: (e: WeightEntry) => void;
  onBreak: (b: Break) => void;
  onNote: (n: WeightNote) => void;
}

/** A trip or note: the owner's words with its date, between weigh-ins or weeks. */
function Aside({ line, on }: { line: Exclude<WeekLine, { kind: "day" }>; on: Handlers }) {
  if (line.kind === "break") {
    return (
      <button type="button" style={row} onClick={() => on.onBreak(line.brk)} aria-label={`Break, ${fmtRange(line.brk)}, ${line.brk.label}`}>
        <span className="break-swatch" style={{ flex: "none", alignSelf: "center" }} />
        <span className="muted" style={{ ...text, flex: 1 }}>
          <span className="num faint">{fmtRange(line.brk)} · </span>
          {line.brk.label}
        </span>
      </button>
    );
  }
  return (
    <button type="button" style={row} onClick={() => on.onNote(line.note)} aria-label={`Note, ${fmtDay(line.note.date)}`}>
      <span className="faint num" style={{ flex: "none", width: 64, fontSize: "var(--t-sm)" }}>
        {fmtDay(line.note.date)}
      </span>
      <span className="muted" style={{ ...text, flex: 1, fontStyle: "italic" }}>
        {line.note.body}
      </span>
    </button>
  );
}

/**
 * The weight history the way the owner's notes keep it: oldest first, one block per
 * week with its weigh-ins and average, phases and trips where they happened.
 * Numbers and the owner's own words only.
 */
export function WeightLog({ items, ...on }: { items: LogItem[] } & Handlers) {
  if (!items.length) return <div className="card"><div className="empty">No weigh-ins yet.</div></div>;
  return (
    <div style={{ display: "grid", gap: "var(--s-3)" }}>
      {items.map((item) => {
        if (item.kind === "phase") {
          const p = item.phase;
          return (
            <div key={item.id} className="card pad" style={{ borderLeft: "3px solid var(--accent)" }}>
              <span className="label">
                {p.calories ? `${p.calories} cal · ` : ""}from {fmtDay(p.start)}
              </span>
              {p.description && (
                <p className="muted" style={{ ...text, margin: "6px 0 0", fontSize: "var(--t-sm)" }}>
                  {p.description}
                </p>
              )}
            </div>
          );
        }
        if (item.kind === "between") {
          return (
            <div key={item.id} style={{ padding: "0 var(--s-3)" }}>
              <Aside line={item.line} on={on} />
            </div>
          );
        }
        return (
          <section key={item.id} className="card pad" aria-label={`Week ${item.number}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="label">Week {item.number}</span>
              <span className="faint num" style={{ fontSize: "var(--t-sm)" }}>
                {weekRange(item.start, item.end)}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              {item.lines.map((l) =>
                l.kind === "day" ? (
                  <button key={l.entry.id} type="button" style={row} onClick={() => on.onDay(l.entry)}>
                    <span className="faint num" style={{ flex: "none", width: 64, fontSize: "var(--t-sm)" }}>
                      {fmtDow(l.date)} {fmtDay(l.date)}
                    </span>
                    <span className="num" style={{ flex: "none", fontWeight: 600 }}>
                      {l.entry.lb.toFixed(1)}
                    </span>
                    {l.entry.note && (
                      <span className="muted" style={{ ...text, flex: 1, fontSize: "var(--t-sm)" }}>
                        {l.entry.note}
                      </span>
                    )}
                  </button>
                ) : (
                  <Aside key={`${l.kind}-${l.kind === "break" ? l.brk.id : l.note.id}`} line={l} on={on} />
                ),
              )}
            </div>
            <div
              className="num"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}
            >
              <span>
                <span className="label">Average </span>
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>{item.avg.toFixed(1)}</span>
              </span>
              <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
                {item.days} of 7 days{item.partial ? " · partial" : ""}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
