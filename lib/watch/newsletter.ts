// Morning Brew–style newsletters (Morning Brew, Tech Brew): the "latest issue" web
// page carries the same HTML as the email. This turns it into sections of plain
// blocks so the app can show the issue to read in place.
//
// The newsletter's words are kept exactly; only sponsorship is removed: whole
// "Sponsored By"/"Presented By" cards, paid-advertisement notes, and any paragraph or
// list carrying an ad-tracked link (mbadid), which is how in-line ads are marked.

import { clean, find, findAll, isEl, parseHtml, textOf, type El } from "./html";
import type { Block, Market, NewsletterSection, NewsletterSnap, Run } from "./types";

const CARD = /border-radius:\s*15px;\s*border:\s*1px solid #e6e6e6/i;
const SPONSOR_KICKER = /^(sponsored by|presented by|together with|a message from|partner)/i;
const PAID_NOTE = /^(✢\s*)?a note from|paid advertisement/i;
const MARKETS_FINE_PRINT = /^(data is provided by|\*?stock data|here['’]s what these numbers mean)/i;
const SPONSOR_NOTE = /^\*?\s*a message from our sponsor/i;
const isAdHref = (href: string) => /[?&](mbadid|mbadv)=/.test(href);
const httpHref = (href: string | undefined) => (href && /^https?:\/\//i.test(href) ? href : undefined);

const style = (e: El) => (e.attrs.style ?? "").toLowerCase();
const isKicker = (e: El) => e.tag === "p" && style(e).includes("text-transform:uppercase");
const isHeadline = (e: El) => (e.tag === "p" && /font-size:\s*2\dpx/.test(style(e)) && style(e).includes("font-weight:700")) || /^h[1-4]$/.test(e.tag);
const hasClass = (e: El, c: string) => (e.attrs.class ?? "").split(/\s+/).includes(c);

/** Inline content as runs, keeping bold, italics and links. */
function runsOf(el: El): Run[] {
  const out: Run[] = [];
  const walk = (e: El, fmt: Omit<Run, "text">) => {
    for (const c of e.children) {
      if (!isEl(c)) {
        out.push({ text: c.replace(/[\s ]+/g, " "), ...fmt });
        continue;
      }
      if (c.tag === "br") out.push({ text: " ", ...fmt });
      else if (c.tag === "img") continue;
      else {
        const next = { ...fmt };
        if (c.tag === "strong" || c.tag === "b") next.b = true;
        if (c.tag === "em" || c.tag === "i") next.i = true;
        if (c.tag === "a" && httpHref(c.attrs.href)) next.href = c.attrs.href;
        walk(c, next);
      }
    }
  };
  walk(el, {});
  // Merge neighbours with the same formatting; trim the ends.
  const merged: Run[] = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.b === r.b && prev.i === r.i && prev.href === r.href) prev.text += r.text;
    else merged.push({ ...r });
  }
  for (const r of merged) r.text = r.text.replace(/ {2,}/g, " ");
  if (merged.length) {
    merged[0].text = merged[0].text.trimStart();
    merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
  }
  return merged.filter((r) => r.text);
}

const runsText = (runs: Run[]) => runs.map((r) => r.text).join("").trim();
const hasAd = (runs: Run[]) => runs.some((r) => r.href && isAdHref(r.href));

/** The blocks of one card, in order. The card's first kicker is returned separately. */
function blocksOf(card: El): { kicker: string | null; blocks: Block[]; ads: number } {
  let kicker: string | null = null;
  const blocks: Block[] = [];
  let ads = 0;

  const walk = (e: El, href: string | undefined) => {
    for (const c of e.children) {
      if (!isEl(c)) continue;
      if ((c.attrs.class ?? "").includes("markets-")) continue; // the numbers table: read by marketsOf
      if (c.tag === "a") {
        const link = httpHref(c.attrs.href) ?? href;
        // A bare link with only text in it (poll answers, "Play the Mini") is its own line.
        if (!find(c, (x) => ["p", "img", "table", "div", "ul", "ol"].includes(x.tag)) && clean(textOf(c))) {
          if (link && isAdHref(link)) ads++;
          else blocks.push({ t: "p", runs: runsOf(c).map((r) => ({ ...r, href: r.href ?? link })) });
          continue;
        }
        walk(c, link);
        continue;
      }
      if (isKicker(c)) {
        const text = clean(textOf(c));
        if (kicker === null) kicker = text;
        else if (text) blocks.push({ t: "h", text, href: null });
        continue;
      }
      if (isHeadline(c)) {
        const text = clean(textOf(c));
        if (text) blocks.push({ t: "h", text, href: href && !isAdHref(href) ? href : null });
        continue;
      }
      if (c.tag === "p") {
        // A photo credit under an image: <p><span><small><em>Getty Images</em></small></span></p>
        const text = clean(textOf(c));
        const prev = blocks[blocks.length - 1];
        if (find(c, (x) => x.tag === "small") && text.length < 100 && prev?.t === "img" && !prev.credit) {
          prev.credit = text;
          continue;
        }
        const runs = runsOf(c);
        if (!runsText(runs)) continue;
        if (hasAd(runs) || (href && isAdHref(href)) || SPONSOR_NOTE.test(runsText(runs))) {
          ads++;
          continue;
        }
        blocks.push({ t: "p", runs });
        continue;
      }
      if (c.tag === "ul" || c.tag === "ol") {
        const items = findAll(c, (x) => x.tag === "li").map(runsOf).filter((r) => runsText(r));
        if (items.some(hasAd)) {
          ads++;
          const kept = items.filter((r) => !hasAd(r));
          if (kept.length) blocks.push({ t: "list", ordered: c.tag === "ol", items: kept });
        } else if (items.length) blocks.push({ t: "list", ordered: c.tag === "ol", items });
        continue;
      }
      if (c.tag === "img") {
        // Story photos are full-width; icons and logos are small.
        const width = Number(c.attrs.width ?? 0);
        const src = httpHref(c.attrs.src);
        if (src && width >= 200 && !/logo/i.test(c.attrs.alt ?? "") && !(href && isAdHref(href))) blocks.push({ t: "img", src, alt: c.attrs.alt ?? "", credit: null });
        continue;
      }
      walk(c, href);
    }
  };
  walk(card, undefined);
  return { kicker, blocks, ads };
}

function marketsOf(card: El): Market[] {
  // The innermost rows: the ones whose own cells are the ticker, value and change.
  const rows: El[] = [];
  const collect = (e: El) => {
    for (const c of e.children) {
      if (!isEl(c)) continue;
      if (c.tag === "tr" && c.children.some((x) => isEl(x) && hasClass(x, "markets-ticker-cell"))) rows.push(c);
      else collect(c);
    }
  };
  collect(card);
  return rows.map((tr) => {
    const cell = (cls: string) => {
      const td = find(tr, (x) => hasClass(x, cls));
      return td ? clean(textOf(td)) : "";
    };
    return { name: cell("markets-ticker-cell"), value: cell("markets-value-cell"), change: cell("markets-bubble-cell") };
  }).filter((m) => m.name && m.value);
}

export function parseNewsletter(html: string, opts: { name: string; url: string; markets: boolean }): NewsletterSnap {
  const root = parseHtml(html);
  const cards = findAll(root, (e) => e.tag === "td" && CARD.test(e.attrs.style ?? ""));
  if (!cards.length) throw new Error("the issue's layout wasn't recognized");

  const h6 = find(root, (e) => e.tag === "h6");
  const subject = h6 ? clean(textOf(h6)).replace(/^☕\s*/, "") || null : null;
  const viewOnline = find(root, (e) => e.tag === "a" && /view online/i.test(textOf(e)));
  const dateCell = find(cards[0], (e) => e.tag === "td" && /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(clean(textOf(e))));

  const sections: NewsletterSection[] = [];
  let topics: string[] = [];
  let markets: Market[] = [];
  let dropped = 0;

  for (const card of cards) {
    const { kicker, blocks, ads } = blocksOf(card);
    dropped += ads;
    const first = blocks[0]?.t === "p" ? runsText(blocks[0].runs) : "";
    if ((kicker && SPONSOR_KICKER.test(kicker) && kicker.toLowerCase() !== "presented by") || PAID_NOTE.test(kicker ?? first)) {
      dropped++;
      continue;
    }
    if (find(card, (e) => hasClass(e, "markets-ticker-cell"))) {
      if (!opts.markets) continue;
      markets = marketsOf(card);
      const notes = blocks.filter((b) => !(b.t === "p" && MARKETS_FINE_PRINT.test(runsText(b.runs))));
      if (notes.length) sections.push({ kicker: kicker ?? "Markets", blocks: notes });
      else if (!markets.length) continue;
      else sections.push({ kicker: kicker ?? "Markets", blocks: [] });
      continue;
    }
    // The opening card: drop its header row and the "Presented By" logo, keep the intro.
    const kept = blocks.filter((b) => !(b.t === "p" && /^(presented by|view online|shop)\b/i.test(runsText(b.runs))));
    for (let i = 0; i < kept.length - 1; i++) {
      const b = kept[i], next = kept[i + 1];
      if (b.t === "p" && /(get into|in today[’']s newsletter):?$/i.test(runsText(b.runs)) && next.t === "list") topics = next.items.map(runsText);
    }
    if (!kept.length) continue;
    sections.push({ kicker: kicker && !SPONSOR_KICKER.test(kicker) ? kicker : null, blocks: kept });
  }

  return {
    name: opts.name, subject, date: dateCell ? clean(textOf(dateCell)) : null, topics, markets, sections, dropped,
    link: httpHref(viewOnline?.attrs.href) ?? opts.url,
  };
}
