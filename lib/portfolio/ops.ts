// Portfolio changes, shared by the Portfolio tab's forms and the chat tools. Each is one
// read → change → save (one commit, one site rebuild). Nothing is deleted: hiding keeps an
// item in the data and off the site, reversibly.

import { updateContent } from "./client";
import { findOne, keyOf, type Card, type FileName, type Item, type Project, type TimelineMonth } from "./types";

const lines = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);

/** An item as the API accepts it: trimmed, empty lists and blank optional fields left out. */
export function clean(file: FileName, item: Item): Item {
  if (file === "projects") {
    const p = item as Project;
    return {
      title: p.title.trim(),
      ...(p.dateRange?.trim() ? { dateRange: p.dateRange.trim() } : {}),
      bullets: lines(p.bullets),
      ...(lines(p.metrics).length ? { metrics: lines(p.metrics) } : {}),
      skills: lines(p.skills),
      tags: lines(p.tags),
      ...(p.repoUrl?.trim() ? { repoUrl: p.repoUrl.trim() } : {}),
      ...(p.hidden ? { hidden: true } : {}),
    } satisfies Project;
  }
  if (file === "timeline") {
    const t = item as TimelineMonth;
    const out: TimelineMonth = { monthLabel: t.monthLabel.trim() };
    for (const k of ["employer", "courses", "certs", "projects"] as const) if (lines(t[k]).length) out[k] = lines(t[k]);
    if (t.hidden) out.hidden = true;
    return out;
  }
  const c = item as Card;
  return {
    section: c.section, title: c.title.trim(), logo: (c.logo ?? "").trim(),
    bullets: lines(c.bullets), skills: lines(c.skills), ...(c.hidden ? { hidden: true } : {}),
  } satisfies Card;
}

/** Adds an item first on its page (new projects and cards lead). A timeline month replaces its own month. */
export function addItem(file: FileName, item: Item) {
  const next = clean(file, item);
  if (file === "timeline") return setMonth(next as TimelineMonth);
  return updateContent<Item>(file, (items) => [next, ...items]);
}

/** Replaces the item found by its current title (or monthLabel) with the edited one. */
export function updateItem(file: FileName, match: string, item: Item) {
  const next = clean(file, item);
  return updateContent<Item>(file, (items) => {
    const i = findOne(items as unknown as Record<string, unknown>[], keyOf(file), match);
    items[i] = next;
    return items;
  });
}

/** Creates or replaces one timeline month. */
export function setMonth(entry: TimelineMonth) {
  const next = clean("timeline", entry) as TimelineMonth;
  return updateContent<TimelineMonth>("timeline", (items) => [...items.filter((e) => e.monthLabel !== next.monthLabel), next]);
}

/** Hides an item from the site (kept in the data) or shows it again. */
export function setHidden(file: FileName, match: string, hidden: boolean) {
  return updateContent<Item>(file, (items) => {
    const i = findOne(items as unknown as Record<string, unknown>[], keyOf(file), match);
    if (hidden) items[i] = { ...items[i], hidden: true };
    else {
      const { hidden: _, ...rest } = items[i];
      items[i] = rest as Item;
    }
    return items;
  });
}
