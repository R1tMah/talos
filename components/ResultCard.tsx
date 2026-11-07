import { useState } from "react";
import type { ChatCard } from "@/lib/agent/cards";
import type { ChatTab } from "@/lib/tabs";
import { fmtDay, fmtNum, logicalToday } from "@/lib/date";
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
  /** "Where does this go?" answered with a tab: the message is sent again to it. */
  pickTab: (tab: ChatTab) => void;
  /** Tabs that can be picked (not archived). */
  tabs: { key: ChatTab; label: string }[];
  dismiss: () => void;
}

/** "1,450 cal left", "320 cal over": what's left of a target, never a negative number. */
export const leftText = (left: number, unit: string) => {
  const n = Math.round(Math.abs(left));
  return left >= 0 ? `${fmtNum(n)} ${unit} left` : `${fmtNum(n)} ${unit} over`;
};

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
      return <UnsureCard card={card} on={on} />;

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

    case "left": {
      // "Today" while it is; the date once it isn't (Chat history, or food logged to another day).
      const when = card.date === logicalToday() ? "Today" : fmtDay(card.date);
      return (
        <div className="rc">
          <div className="rc-line">
            <span className="rc-text num">
              {when}: {leftText(card.calTarget - card.cal, "cal")}, {leftText(card.proteinTarget - card.protein, "g protein")}
            </span>
          </div>
          <span className="faint num" style={{ fontSize: "var(--t-sm)" }}>
            {fmtNum(Math.round(card.cal))} / {fmtNum(card.calTarget)} cal · {Math.round(card.protein)} / {card.proteinTarget} g protein
          </span>
        </div>
      );
    }

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

const LAST_TIME = "Last time";

/**
 * "Where does this go?": the model's best readings, then any tab. When the owner filed a
 * message like this before, that tab comes first and says so.
 */
function UnsureCard({ card, on }: { card: Extract<ChatCard, { kind: "unsure" }>; on?: CardHandlers }) {
  const [picking, setPicking] = useState(false);
  const suggested = card.suggested ? on?.tabs.find((t) => t.key === card.suggested) : undefined;
  const optionHit = suggested && card.options.findIndex((o) => o.tab === suggested.key);
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
          <>
            {suggested && <span className="rc-detail">You put something like this in {suggested.label} last time.</span>}
            <div className="rc-chips">
              {suggested && optionHit === -1 && (
                <button type="button" className="chip chip-suggested" onClick={() => on.pickTab(suggested.key)}>
                  <span className="chip-tool">
                    {suggested.label}
                    <span className="chip-note">{LAST_TIME}</span>
                  </span>
                </button>
              )}
              {card.options.map((o, i) => (
                <OptionChip
                  key={o.proposalId}
                  tool={o.tool}
                  fields={o.fields}
                  note={suggested && i === optionHit ? LAST_TIME : undefined}
                  onClick={() => on.choose(i)}
                />
              ))}
            </div>
            {/* A narrower question (which saved meal?) is answered from its own options. */}
            {!card.title &&
              (picking ? (
                <div className="rc-tabs" role="group" aria-label="Put it in a tab">
                  {on.tabs.map((t) => (
                    <button key={t.key} type="button" className="tab-chip" onClick={() => on.pickTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="btn btn-sm rc-more" onClick={() => setPicking(true)}>
                  Something else…
                </button>
              ))}
          </>
        )
      )}
    </div>
  );
}
