"use client";

import { useEffect, useState } from "react";
import { FormSheet, type Field } from "@/components/FormSheet";
import { IconCheck } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { EmptyState, Fab, ScreenHeader, Segmented, SectionTitle, Tag } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import { byCategory, EXPERIENCE_CATEGORIES, type Experience } from "@/lib/experiences";
import { experiencesApi, useExperiences, type WriteResult } from "@/lib/experiencesData";

type View = "recs" | "done";
type Sheet =
  | { kind: "add"; completed: boolean }
  | { kind: "edit"; item: Experience }
  | { kind: "reflect"; item: Experience }; // just checked off: optional note and rating

const RATING = ["", "1", "2", "3", "4", "5"];
const BASE: Field[] = [
  { name: "title", label: "What", full: true, placeholder: "Atomic Habits, Open a Roth IRA, Bouldering class" },
  { name: "category", label: "Category", type: "select", options: ["", ...EXPERIENCE_CATEGORIES], full: true },
  { name: "recommendedBy", label: "Recommended by (optional)", full: true, placeholder: "Sarah, Twitter, Mom" },
];
const REFLECT: Field[] = [
  { name: "note", label: "Note (optional)", full: true, placeholder: "One line on how it was" },
  { name: "rating", label: "Rating (optional)", type: "select", options: RATING },
];

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const day = (iso: string) => fmtDay(logicalToday(new Date(iso)));
const str = (v: unknown) => String(v ?? "").trim();
const ratingOf = (v: unknown) => (str(v) ? Number(v) : null);

/** Recommendations (the to-do list) and Experiences (the archive of ones done). */
export default function ExperiencesPage() {
  const { rows, failed, reload } = useExperiences();
  const [view, setView] = useState<View>("recs");
  const [order, setOrder] = useState<"category" | "recent">("category");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  // Just added: scrolled to the middle of the screen and highlighted for a moment.
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    if (!fresh || !rows?.some((r) => r.id === fresh)) return;
    document.querySelector(`[data-exp="${fresh}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFresh(null), 1800);
    return () => clearTimeout(t);
  }, [fresh, rows, view, order]);

  const report = (r: WriteResult) => {
    if (r.status === "conflict") setNotice(`"${r.title}" is already on your list.`);
    else if (r.status !== "saved") setNotice("Failed");
    else setNotice(null);
    return r;
  };

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Recommendations" back="/tabs" />
        <p role="alert" className="muted">Failed. <button type="button" className="btn btn-sm" onClick={reload}>Retry</button></p>
      </main>
    ) : <PageSkeleton />;
  }

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status === "completed");

  /** Checks an item off: it slides out, then the optional note/rating sheet opens. */
  const check = async (item: Experience) => {
    setLeaving((s) => new Set(s).add(item.id));
    const r = report(await experiencesApi.complete(item.id, null, null));
    setTimeout(async () => {
      await reload();
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      if (r.status === "saved") setSheet({ kind: "reflect", item: { ...item, status: "completed" } });
    }, 260);
  };

  const recRow = (item: Experience) => (
    <div key={item.id} data-exp={item.id} className={`row exp-row${leaving.has(item.id) ? " leaving" : ""}${fresh === item.id ? " fresh" : ""}`}>
      <button type="button" className="note-check" role="checkbox" aria-checked={leaving.has(item.id)} aria-label={`Done: ${item.title}`}
        onClick={() => check(item)} disabled={leaving.has(item.id)}>
        {leaving.has(item.id) && <IconCheck size={14} />}
      </button>
      <button type="button" className="exp-main" onClick={() => setSheet({ kind: "edit", item })}>
        <span className="cell-main">{item.title}</span>
        {item.recommendedBy && <span className="cell-sub">👤 Recommended by {item.recommendedBy}</span>}
      </button>
    </div>
  );

  const doneRow = (item: Experience, showCategory: boolean) => (
    <button key={item.id} type="button" data-exp={item.id} className={`row exp-row${fresh === item.id ? " fresh" : ""}`} onClick={() => setSheet({ kind: "edit", item })}>
      <span className="exp-main">
        <span className="cell-main">{item.title}</span>
        <span className="cell-sub">
          {[showCategory && item.category, item.recommendedBy && `👤 ${item.recommendedBy}`, item.completedAt && day(item.completedAt)].filter(Boolean).join(" · ")}
        </span>
        {item.note && <span className="cell-sub exp-note">{item.note}</span>}
      </span>
      {item.rating != null && <span className="exp-stars" aria-label={`${item.rating} of 5`}>{stars(item.rating)}</span>}
    </button>
  );

  return (
    <main className="screen">
      <ScreenHeader title="Recommendations" back="/tabs" />
      <Segmented options={[{ value: "recs", label: `Recommendations (${pending.length})` }, { value: "done", label: `Experiences (${done.length})` }]} value={view} onChange={setView} />
      {notice && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>{notice}</p>}

      {view === "recs" && (pending.length === 0 ? (
        <EmptyState text="Nothing recommended yet. Add one here or tell chat: “add Atomic Habits to books, recommended by Sarah”." onAdd={() => setSheet({ kind: "add", completed: false })} />
      ) : (
        byCategory(pending).map((g) => (
          <section key={g.category} className="exp-group">
            <SectionTitle right={<Tag tone="tag-outline">{g.items.length}</Tag>}>{g.category}</SectionTitle>
            <div className="card list">{g.items.map(recRow)}</div>
          </section>
        ))
      ))}

      {view === "done" && (done.length === 0 ? (
        <EmptyState text="Nothing here yet. Check off a recommendation, or log something you've already done." onAdd={() => setSheet({ kind: "add", completed: true })} />
      ) : (
        <>
          <Segmented options={[{ value: "category", label: "By category" }, { value: "recent", label: "Most recent" }]} value={order} onChange={setOrder} />
          {order === "category"
            ? byCategory(done).map((g) => (
                <section key={g.category} className="exp-group">
                  <SectionTitle right={<Tag tone="tag-outline">{g.items.length}</Tag>}>{g.category}</SectionTitle>
                  <div className="card list">{g.items.map((i) => doneRow(i, false))}</div>
                </section>
              ))
            : <div className="card list">{done.map((i) => doneRow(i, true))}</div>}
        </>
      ))}

      <Fab label={view === "recs" ? "Add recommendation" : "Log an experience"} onClick={() => setSheet({ kind: "add", completed: view === "done" })} />

      {sheet?.kind === "add" && (
        <FormSheet
          title={sheet.completed ? "Log an experience" : "Add recommendation"}
          fields={[...BASE, { name: "completed", label: "Already done", type: "toggle" }, ...(sheet.completed ? REFLECT : [])]}
          initial={{ completed: sheet.completed }}
          validate={(v) => (!str(v.title) ? "What is it?" : !str(v.category) ? "Pick a category." : null)}
          onClose={() => setSheet(null)}
          onSubmit={async (v) => {
            setSheet(null);
            const completed = Boolean(v.completed);
            const r = report(await experiencesApi.add({
              title: str(v.title), category: v.category as Experience["category"], recommendedBy: str(v.recommendedBy) || null,
              completed, note: completed ? str(v.note) || null : null, rating: completed ? ratingOf(v.rating) : null,
            }));
            if (r.status === "saved") {
              setView(completed ? "done" : "recs");
              if (r.id) setFresh(r.id);
            }
            reload();
          }}
        />
      )}

      {sheet?.kind === "reflect" && (
        <FormSheet
          title={`Done: ${sheet.item.title}`}
          fields={REFLECT}
          initial={{}}
          submitLabel="Save"
          onClose={() => setSheet(null)}
          onSubmit={async (v) => {
            const item = sheet.item;
            setSheet(null);
            if (!str(v.note) && !str(v.rating)) return;
            report(await experiencesApi.update(item.id, { title: item.title, category: item.category, recommendedBy: item.recommendedBy, note: str(v.note) || null, rating: ratingOf(v.rating) }));
            reload();
          }}
        />
      )}

      {sheet?.kind === "edit" && (
        <FormSheet
          title={sheet.item.status === "completed" ? "Edit experience" : "Edit recommendation"}
          fields={[...BASE, ...(sheet.item.status === "completed" ? REFLECT : [])]}
          initial={{ title: sheet.item.title, category: sheet.item.category, recommendedBy: sheet.item.recommendedBy ?? "", note: sheet.item.note ?? "", rating: sheet.item.rating == null ? "" : String(sheet.item.rating) }}
          confirm
          validate={(v) => (!str(v.title) ? "What is it?" : !str(v.category) ? "Pick a category." : null)}
          onClose={() => setSheet(null)}
          onDelete={async () => {
            const id = sheet.item.id;
            setSheet(null);
            report(await experiencesApi.remove(id));
            reload();
          }}
          onSubmit={async (v) => {
            const id = sheet.item.id;
            setSheet(null);
            report(await experiencesApi.update(id, { title: str(v.title), category: v.category as Experience["category"], recommendedBy: str(v.recommendedBy) || null, note: str(v.note) || null, rating: ratingOf(v.rating) }));
            reload();
          }}
        />
      )}
    </main>
  );
}
