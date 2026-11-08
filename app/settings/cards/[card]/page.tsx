"use client";

import { useParams } from "next/navigation";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader } from "@/components/ui";
import { cardDef, shownRows } from "@/lib/homeCards";
import { useHomeCards } from "@/lib/homeCardsData";

/**
 * Settings > Home cards > one card: a switch per row it can show, a preview of the card
 * with the rows' names, and Reset to go back to the defaults. Saves on every switch.
 */
export default function HomeCardPage() {
  const { card } = useParams<{ card: string }>();
  const def = cardDef(card);
  const { config, failed, save } = useHomeCards();

  if (!def) {
    return (
      <main className="screen">
        <ScreenHeader title="Home cards" back="/settings/cards" />
        <p className="muted">There&rsquo;s no card called that.</p>
      </main>
    );
  }

  const on = shownRows(def.key, config);
  const customized = !!config?.[def.key];
  const toggle = (key: string) => save(def.key, on.has(key) ? [...on].filter((k) => k !== key) : [...on, key]);

  return (
    <main className="screen">
      <ScreenHeader title={def.title} back="/settings/cards" />

      <span className="label group-title">Preview</span>
      <div className="grid-2">
        <StatCard
          title={def.title}
          value="–"
          rows={def.rows.filter((r) => on.has(r.key)).map((r) => ({ label: r.label, value: "" }))}
        />
      </div>

      <span className="label group-title">Rows</span>
      <div className="card list">
        {def.rows.map((r) => (
          <div key={r.key} className="row">
            <span className="row-label">
              {r.label}
              {r.on && <span className="cell-sub">On by default</span>}
            </span>
            <button
              type="button" role="switch" className="switch" aria-checked={on.has(r.key)} aria-label={`Show ${r.label}`} disabled={!config}
              onClick={() => toggle(r.key)}
            />
          </div>
        ))}
      </div>
      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "calc(-1 * var(--s-2)) var(--s-4) 0" }}>
        Rows from an archived tab stay hidden on TALOS even when they&rsquo;re on here.
      </p>

      {customized && (
        <button type="button" className="btn" onClick={() => save(def.key, null)}>
          Reset to default
        </button>
      )}
      {failed && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>Couldn&rsquo;t save that. Try again.</p>}
    </main>
  );
}
