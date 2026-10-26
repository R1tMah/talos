import type { ChatCard } from "@/lib/agent/cards";
import { ChangeList } from "./ChangeList";
import { IconAlert, IconCheck, IconQuestion, IconX } from "./Icons";
import { OptionChip } from "./OptionChip";

export interface CardHandlers {
  undo: () => void;
  choose: (i: number) => void;
  save: () => void;
  edit: () => void;
  confirm: () => void;
  cancel: () => void;
  fill: () => void;
  /** Absent when there's no prompt to bring back. */
  retry?: () => void;
  dismiss: () => void;
}

const Done = ({ children }: { children: string }) => (
  <span className="faint" style={{ fontSize: "var(--t-sm)" }}>
    {children}
  </span>
);

/** Every response in chat is one of these, built by code. No model prose. Without `on`, it's read-only (Chat history). */
export function ResultCard({ card, on }: { card: ChatCard; on?: CardHandlers }) {
  switch (card.kind) {
    case "saved":
      return (
        <div className="rc">
          <div className="rc-line">
            <span className="rc-icon">
              <IconCheck />
            </span>
            <span className={`rc-text num${card.undone ? " rc-strike" : ""}`}>Saved: {card.label}</span>
            {card.undone ? (
              <Done>Undone</Done>
            ) : (
              (card.actionId || card.googleEvent) &&
              on && (
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
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <div className="rc-line">
            <span className="rc-icon warn">
              <IconQuestion />
            </span>
            <span className="rc-title">{card.title ?? "Where does this go?"}</span>
          </div>
          {card.resolved ? (
            <Done>Picked</Done>
          ) : (
            on && (
              <div className="rc-chips">
                {card.options.map((o, i) => (
                  <OptionChip key={o.proposalId} tool={o.tool} fields={o.fields} onClick={() => on.choose(i)} />
                ))}
              </div>
            )
          )}
        </div>
      );

    case "warning":
      return (
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <div className="rc-line">
            {/* A confirmation (title given) asks; a warning flags something that looks off. */}
            <span className={`rc-icon${card.title ? "" : " warn"}`}>{card.title ? <IconQuestion /> : <IconAlert />}</span>
            <span className="rc-title">{card.title ?? <>That doesn&rsquo;t look right, are you sure?</>}</span>
          </div>
          <span className="rc-detail num">{card.detail}</span>
          {card.resolved ? (
            <Done>{card.resolved === "saved" ? "Saved" : "Editing"}</Done>
          ) : (
            on && (
              <div className="rc-actions">
                <button type="button" className="btn btn-primary" onClick={on.save}>
                  {card.action ?? "Yes, save"}
                </button>
                <button type="button" className="btn" onClick={on.edit}>
                  Edit
                </button>
              </div>
            )
          )}
        </div>
      );

    case "confirm":
      return (
        <div className={`rc${card.resolved ? " resolved" : ""}`}>
          <span className="label">{card.title}</span>
          <ChangeList changes={card.changes} />
          {card.resolved ? (
            <Done>{card.resolved === "confirmed" ? "Confirmed" : "Cancelled"}</Done>
          ) : (
            on && (
              <div className="rc-actions">
                <button type="button" className="btn btn-primary" onClick={on.confirm}>
                  Confirm
                </button>
                <button type="button" className="btn" onClick={on.cancel}>
                  Cancel
                </button>
              </div>
            )
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
            <span className="rc-title">{card.title}</span>
          </div>
          <div className="missing-list">
            <span className="rc-detail">Missing</span>
            {card.missing.map((m) => (
              <span key={m.name} className="tag tag-outline">
                {m.label}
              </span>
            ))}
          </div>
          {card.resolved ? (
            <Done>{card.resolved === "filled" ? "Filled in" : "Cancelled"}</Done>
          ) : (
            on && (
              <div className="rc-actions">
                <button type="button" className="btn btn-primary" onClick={on.fill}>
                  Fill in
                </button>
                <button type="button" className="btn" onClick={on.cancel}>
                  Cancel
                </button>
              </div>
            )
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
              {card.detail ? `Failed: ${card.detail}` : "Failed"}
            </span>
            {on?.retry && (
              <button type="button" className="btn btn-sm" onClick={on.retry}>
                Retry
              </button>
            )}
            {on && (
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={on.dismiss}>
                <IconX size={18} />
              </button>
            )}
          </div>
        </div>
      );
  }
}
