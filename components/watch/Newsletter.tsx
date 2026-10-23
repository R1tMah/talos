"use client";

// A newsletter issue to read in place: the newsletter's own text, sections and photos,
// with sponsorship already removed by the parser. Only links inside the text open tabs.

import Link from "next/link";
import type { WatchSource } from "@/lib/watch/data";
import type { Block, Market, NewsletterSnap, Run } from "@/lib/watch/types";
import { IconChevron } from "@/components/Icons";
import { Fallback } from "./Views";

const linkOut = { target: "_blank", rel: "noopener noreferrer" } as const;

export function NewsletterCard({ s }: { s: WatchSource }) {
  const n = s.data as NewsletterSnap | null;
  return (
    <section className="card watch-card">
      <div className="watch-head">
        <Link href={`/watch/${s.id}`} className="watch-title">
          <span className="label">{s.title}</span>
          <IconChevron size={14} />
        </Link>
        {n?.date && <span className="faint">{n.date.replace(/, \d{4}$/, "")}</span>}
      </div>
      <Fallback s={s} />
      {n && (
        <Link href={`/watch/${s.id}`} className="nl-teaser">
          {n.subject && <b>{n.subject}</b>}
          {n.topics.length > 0 && (
            <ul>
              {n.topics.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
          {!n.topics.length && <span className="faint">{n.sections.length} sections · Read</span>}
        </Link>
      )}
    </section>
  );
}

export function NewsletterView({ s }: { s: WatchSource }) {
  const n = s.data as NewsletterSnap | null;
  if (!n) return null;
  return (
    <article className="nl">
      <header className="nl-top">
        {n.subject && <h2>{n.subject}</h2>}
        <span className="faint">{[n.date, n.dropped ? `${n.dropped} sponsor ${n.dropped === 1 ? "section" : "sections"} left out` : null].filter(Boolean).join(" · ")}</span>
      </header>
      {n.sections.map((sec, i) => (
        <section key={i} className="card nl-section">
          {sec.kicker && <span className="nl-kicker">{sec.kicker}</span>}
          {sec.kicker === "Markets" && n.markets.length > 0 && <Markets rows={n.markets} />}
          {sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}
        </section>
      ))}
      <p className="watch-foot faint">
        <a href={n.link} {...linkOut}>View this issue on the web</a>
      </p>
    </article>
  );
}

function Markets({ rows }: { rows: Market[] }) {
  return (
    <div className="nl-markets">
      {rows.map((m) => (
        <div key={m.name}>
          <span className="faint">{m.name}</span>
          <b className="num">{m.value}</b>
          <span className={`num ${m.change.startsWith("-") ? "down" : "up"}`}>{m.change}</span>
        </div>
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h":
      return <h3 className="nl-h">{b.text}</h3>;
    case "p":
      return <p className="nl-p"><Runs runs={b.runs} /></p>;
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag className="nl-list">
          {b.items.map((runs, i) => <li key={i}><Runs runs={runs} /></li>)}
        </Tag>
      );
    }
    case "img":
      return (
        <figure className="nl-fig">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote newsletter photos, shown as sent */}
          <img src={b.src} alt={b.alt} loading="lazy" referrerPolicy="no-referrer" />
          {b.credit && <figcaption className="faint">{b.credit}</figcaption>}
        </figure>
      );
  }
}

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let el: React.ReactNode = r.text;
        if (r.i) el = <em>{el}</em>;
        if (r.b) el = <strong>{el}</strong>;
        return r.href ? <a key={i} href={r.href} {...linkOut}>{el}</a> : <span key={i}>{el}</span>;
      })}
    </>
  );
}
