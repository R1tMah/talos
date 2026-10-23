// A small, forgiving HTML parser for newsletter pages: enough structure to walk
// email-style markup (tables, unquoted attributes, a whole <html> nested inside the
// page), never used to render HTML. Scripts, styles and comments are dropped.

export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  parent: El | null;
}
export type Node = El | string;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "noscript", "title", "textarea"]);
// Tags that close an open sibling of the same kind (an unclosed <p> or <li>).
const SELF_CLOSING_SIBLINGS = new Set(["p", "li", "tr", "td", "th", "option"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·", zwnj: "", zwj: "",
};
export const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const safeChar = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");

const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function parseHtml(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html))) {
    if (m.index > last) cur.children.push(decodeEntities(html.slice(last, m.index)));
    last = TOKEN.lastIndex;
    if (m[1]) {
      // A closer: pop to the nearest open element with that name; ignore it if none is open.
      const name = m[1].toLowerCase();
      let el: El | null = cur;
      while (el && el.tag !== name) el = el.parent;
      if (el?.parent) cur = el.parent;
      continue;
    }
    if (!m[2]) continue; // comment, doctype, CDATA
    const tag = m[2].toLowerCase();
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(ATTR)) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    if (RAW.has(tag)) {
      // Skip the raw body up to its closer.
      const end = html.toLowerCase().indexOf(`</${tag}`, last);
      last = TOKEN.lastIndex = end < 0 ? html.length : html.indexOf(">", end) + 1 || html.length;
      continue;
    }
    if (SELF_CLOSING_SIBLINGS.has(tag) && cur.tag === tag && cur.parent) cur = cur.parent;
    const el: El = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3] ?? "")) cur = el;
  }
  if (last < html.length) cur.children.push(decodeEntities(html.slice(last)));
  return root;
}

export const isEl = (n: Node): n is El => typeof n !== "string";

/** Every element under `el` (document order) that passes `test`, not looking inside matches. */
export function findAll(el: El, test: (e: El) => boolean): El[] {
  const out: El[] = [];
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (test(c)) out.push(c);
    else out.push(...findAll(c, test));
  }
  return out;
}

export function find(el: El, test: (e: El) => boolean): El | null {
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (test(c)) return c;
    const hit = find(c, test);
    if (hit) return hit;
  }
  return null;
}

export const textOf = (n: Node): string => (isEl(n) ? n.children.map(textOf).join("") : n);
export const clean = (s: string) => s.replace(/[\s ]+/g, " ").trim();
