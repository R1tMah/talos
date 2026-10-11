import type { Card } from "@/lib/types";
import { ChangeList } from "./ChangeList";
import { IconAlert, IconCheck, IconQuestion } from "./Icons";
import { OptionChip, PlainChip } from "./OptionChip";

export interface CardHandlers {
  undo: () => void;
  choose: (i: number) => void;
  saveNote: () => void;
  save: () => void;
  edit: () => void;
  confirm: () => void;
  cancel: () => void;
  fill: () => void;
}

/** Every response in chat is one of these. No prose. */
export function ResultCard({ card, on }: { card: Card; on: CardHandlers }) {
  switch (card.kind) {
    case "saved":
      return (
        <div className="rc">
          <div className="rc-line">
            <span className="rc-icon">
              <IconCheck />
            </span>
            <span className={`rc-text num${card.undone ? " rc-strike" : ""}`}>{card.label}</span>
            {card.undone ? (
              <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
                Undone
              </span>
            ) : (
              card.undo && (
                <button type="button" className="btn btn-sm" onClick={on.undo}>
                  Undo
                </button>
              )
            )}
          </div>
        </div>
      );

    case "unsure":
      return (
        <div className="rc">
          <div className="rc-line">
            <span className="rc-icon warn">
              <IconQuestion />
            </span>
            <span className="rc-title">Where does this go?</span>
          </div>
          <div className="rc-chips">
            {card.options.map((o, i) => (
              <OptionChip key={o.tool} tool={o.tool} fields={o.fields} onClick={() => on.choose(i)} />
            ))}
            <PlainChip label="Save as note" onClick={on.saveNote} />
          </div>
        </div>
      );

    case "warning":
      return (
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <div className="rc-line">
            <span className="rc-icon warn">
              <IconAlert />
            </span>
            <span className="rc-title">That doesn&rsquo;t look right, are you sure?</span>
          </div>
          <span className="rc-detail num">{card.detail}</span>
          {card.resolved ? (
            <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
              Editing
            </span>
          ) : (
            <div className="rc-actions">
              <button type="button" className="btn btn-primary" onClick={on.save}>
                Yes, save
              </button>
              <button type="button" className="btn" onClick={on.edit}>
                Edit
              </button>
            </div>
          )}
        </div>
      );

    case "confirm":
      return (
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <span className="label">{card.title}</span>
          <ChangeList changes={card.changes} />
          {card.resolved ? (
            <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
              Cancelled
            </span>
          ) : (
            <div className="rc-actions">
              <button type="button" className="btn btn-primary" onClick={on.confirm}>
                Confirm
              </button>
              <button type="button" className="btn" onClick={on.cancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      );

    case "missing":
      return (
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <div className="rc-line">
            <span className="rc-icon warn">
              <IconAlert />
            </span>
            <span className="rc-title">
              {card.tool}: {card.draft.company}
            </span>
          </div>
          <div className="missing-list">
            <span className="rc-detail">Missing</span>
            {card.missing.map((m) => (
              <span key={m} className="tag tag-outline">
                {m}
              </span>
            ))}
          </div>
          {card.resolved ? (
            <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
              Cancelled
            </span>
          ) : (
            <div className="rc-actions">
              <button type="button" className="btn btn-primary" onClick={on.fill}>
                Fill in
              </button>
              <button type="button" className="btn" onClick={on.cancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      );

    case "query":
      return (
        <div className="rc">
          <span className="label">{card.title}</span>
          {card.value != null && (
            <span className="query-value num">
              {card.value}
              {card.unit && <small>{card.unit}</small>}
            </span>
          )}
          {card.table && (
            <table className="mini-table num">
              <thead>
                <tr>
                  {card.table.cols.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );

    case "failed":
      return (
        <div className="rc">
          <div className="rc-line">
            <span className="rc-icon danger">
              <IconAlert />
            </span>
            <span className="rc-text" style={{ color: "var(--danger)" }}>
              Failed
            </span>
          </div>
        </div>
      );
  }
}
