import type { Change } from "@/lib/types";

/** Old value to new value, used by confirm cards and edit sheets. */
export function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <div className="changes">
      {changes.map((c) => (
        <div key={c.field} className="change">
          <span className="change-field label">{c.field}</span>
          <span className="change-vals num">
            <span className="change-from">{c.from || "empty"}</span>
            <span className="faint" aria-label="to">
              →
            </span>
            <span className="change-to">{c.to || "empty"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
