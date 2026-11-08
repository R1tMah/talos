"use client";

import Link from "next/link";
import { IconChevron } from "@/components/Icons";
import { ScreenHeader } from "@/components/ui";
import { HOME_CARDS, shownRows } from "@/lib/homeCards";
import { useHomeCards } from "@/lib/homeCardsData";

/** Settings > Home cards: every TALOS card, with how many of its rows are showing; tap one to pick. */
export default function HomeCardsPage() {
  const { config, failed } = useHomeCards();
  return (
    <main className="screen">
      <ScreenHeader title="Home cards" back="/settings" />
      <p className="faint" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
        Pick what each card on TALOS shows under its big number.
      </p>
      <div className="card list">
        {HOME_CARDS.map((c) => {
          const on = shownRows(c.key, config).size;
          return (
            <Link key={c.key} href={`/settings/cards/${c.key}`} className="row">
              <span className="row-label">{c.title}</span>
              <span className="row-value num">
                {config ? `${on} of ${c.rows.length}${config[c.key] ? "" : " (default)"}` : ""}
              </span>
              <IconChevron />
            </Link>
          );
        })}
      </div>
      {failed && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>Couldn&rsquo;t load or save your picks.</p>}
    </main>
  );
}
