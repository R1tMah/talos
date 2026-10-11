"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, Sheet, type Field } from "@/components/FormSheet";
import { IconBack, IconChevron } from "@/components/Icons";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Segmented, Tag } from "@/components/ui";
import { addDays, fmtDay, fmtDow, fmtNum, fromISO, logicalToday, weekStart } from "@/lib/date";
import {
  nutritionApi, useNutritionData, type FoodSource, type LogEntry, type Macros, type Meal, type MealInput, type WriteResult,
} from "@/lib/nutritionData";

type View = "log" | "meals";

const MACROS: Field[] = [
  { name: "cal", label: "Calories", type: "number", optional: true },
  { name: "p", label: "Protein (g)", type: "number", optional: true },
];

const TYPED_FIELDS: Field[] = [{ name: "name", label: "Food", full: true }, ...MACROS, { name: "date", label: "Date", type: "date" }];

const PORTION_FIELDS: Field[] = [
  { name: "portions", label: "Portions", type: "number" },
  { name: "date", label: "Date", type: "date" },
];

const MEAL_FIELDS: Field[] = [
  { name: "name", label: "Name", full: true },
  { name: "aliases", label: "Aliases", full: true, placeholder: "Comma separated, e.g. flatbread dinner" },
  { name: "unit", label: "One portion is", placeholder: "serving, oz, scoop" },
  ...MACROS,
];

const SOURCE_LABEL: Record<FoodSource, string> = { typed: "typed", saved_meal: "saved meal", photo_estimate: "estimate" };

const pct = (v: number, t: number) => `${Math.min(100, t ? (v / t) * 100 : 0)}%`;
const grams = (n: number | null) => (n == null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const portionText = (e: { portions: number | null; unit: string | null }) =>
  e.portions == null ? "" : `${grams(e.portions)} ${e.unit ?? "serving"}`;

// ---- Validation (shapes only; the database does all macro math) ----------------

const bad = (v: unknown) => v == null || typeof v !== "number" || !Number.isFinite(v);

function checkMacros(v: Record<string, unknown>) {
  if (bad(v.cal)) return "Calories are required.";
  if (bad(v.p)) return "Protein is required.";
  if ((v.cal as number) < 0 || (v.p as number) < 0) return "Values can't be negative.";
  return null;
}

const checkTyped = (v: Record<string, unknown>) =>
  !String(v.name ?? "").trim() ? "Food is required." : !v.date ? "Date is required." : checkMacros(v);

const checkPortions = (v: Record<string, unknown>) =>
  bad(v.portions) || (v.portions as number) <= 0 ? "Portions must be more than 0." : !v.date ? "Date is required." : null;

const checkMeal = (v: Record<string, unknown>) => (!String(v.name ?? "").trim() ? "Name is required." : checkMacros(v));

const macrosOf = (v: Record<string, unknown>): Macros => ({
  cal: Math.round(v.cal as number),
  p: v.p as number,
});

const mealOf = (v: Record<string, unknown>): MealInput => ({
  name: String(v.name).trim(),
  aliases: String(v.aliases ?? "").split(",").map((a) => a.trim()).filter(Boolean),
  unit: String(v.unit ?? "").trim() || "serving",
  ...macrosOf(v),
});

type SheetState =
  | { kind: "choose" }
  | { kind: "typed"; row?: LogEntry }
  | { kind: "portions"; row: LogEntry }
  | { kind: "logMeal"; meal?: Meal }
  | { kind: "meal"; row?: Meal };

function Nutrition() {
  const params = useSearchParams();
  const today = logicalToday();
  const [view, setView] = useState<View>(params.get("view") === "meals" ? "meals" : "log");
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const { data, failed, reload } = useNutritionData(date);

  /** Runs a write, reloads, and reports anything other than a save in plain words. */
  const run = async (write: Promise<WriteResult>, ok?: string) => {
    setNotice(null);
    const r = await write;
    if (r.status === "saved") setNotice(ok ? { text: ok, ok: true } : null);
    else if (r.status === "conflict") setNotice({ text: `A saved meal named "${r.existing.name}" already exists.`, ok: false });
    else setNotice({ text: "Failed", ok: false });
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="Nutrition" back="/tabs" />
        <p role="alert" className="muted">
          Failed.{" "}
          <button type="button" className="btn btn-sm" onClick={reload}>
            Retry
          </button>
        </p>
      </main>
    ) : (
      <PageSkeleton />
    );
  }

  const { entries, days, targets, meals } = data;
  const day = days.find((d) => d.date === date);
  const loggedDays = new Set(days.map((d) => d.date));
  const ws = weekStart(date);

  // Week of the selected day, Monday through today at the latest; only logged days count.
  const weekEnd = addDays(ws, 6) < today ? addDays(ws, 6) : today;
  const weekRows = days.filter((d) => d.date >= ws && d.date <= weekEnd);
  const weekTotal = weekRows.reduce((a, d) => a + d.cal, 0);
  const weekLen = Math.round((fromISO(weekEnd).getTime() - fromISO(ws).getTime()) / 86400000) + 1;
  const isThisWeek = ws === weekStart(today);

  const mealLabel = (m: Meal) => `${m.name} · per ${m.unit}`;
  const logMealFields: Field[] = [
    { name: "meal", label: "Saved meal", type: "select", options: meals.map(mealLabel), full: true },
    ...PORTION_FIELDS,
  ];

  return (
    <main className="screen">
      <ScreenHeader title="Nutrition" back="/tabs" right={<ExportButton tab="nutrition" />} />
      <Segmented
        options={[
          { value: "log", label: "Log" },
          { value: "meals", label: "Saved meals" },
        ]}
        value={view}
        onChange={setView}
      />

      {notice && (
        <p role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "var(--text-2)" : "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice.text}
        </p>
      )}

      {view === "log" && (
        <>
          <div className="daypicker">
            <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setDate(addDays(date, -7))}>
              <IconBack size={18} />
            </button>
            <div className="days">
              {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`day num${loggedDays.has(d) ? " has" : ""}`}
                  aria-pressed={d === date}
                  disabled={d > today}
                  onClick={() => setDate(d)}
                >
                  <small>{fmtDow(d).slice(0, 1)}</small>
                  <b>{fromISO(d).getDate()}</b>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next week"
              disabled={addDays(ws, 7) > today}
              style={{ opacity: addDays(ws, 7) > today ? 0.3 : 1 }}
              onClick={() => setDate(addDays(date, 7) > today ? today : addDays(date, 7))}
            >
              <IconChevron width={18} height={18} />
            </button>
          </div>

          <div className="card pad macros">
            <div className="grid-2" style={{ gap: "var(--s-4)" }}>
              <div>
                <div className="macro-head">
                  <span className="label">Calories</span>
                </div>
                <div className="macro-big num">
                  {fmtNum(day?.cal ?? 0)} <small>/ {fmtNum(targets.cal)}</small>
                </div>
                <div className="meter" style={{ marginTop: 8 }}>
                  <div style={{ width: pct(day?.cal ?? 0, targets.cal) }} />
                </div>
              </div>
              <div>
                <div className="macro-head">
                  <span className="label">Protein</span>
                </div>
                <div className="macro-big num">
                  {grams(day?.p ?? 0)} <small>/ {targets.p} g</small>
                </div>
                <div className="meter" style={{ marginTop: 8 }}>
                  <div style={{ width: pct(day?.p ?? 0, targets.p) }} />
                </div>
              </div>
            </div>
          </div>

          <SummaryStrip
            items={[
              { label: isThisWeek ? "Week so far" : `Week of ${fmtDay(ws)}`, value: fmtNum(weekTotal), unit: "kcal" },
              { label: "Days logged", value: weekRows.length, sub: `of ${weekLen}` },
              { label: "Daily avg", value: weekRows.length ? fmtNum(weekTotal / weekRows.length) : "–", unit: "kcal" },
            ]}
          />

          <SectionTitle>
            {date === today ? "Today" : `${fmtDow(date)} ${fmtDay(date)}`}, {entries.length} entries
          </SectionTitle>
          <DataTable
            rows={entries}
            empty="Nothing logged this day."
            onAdd={() => setSheet(meals.length ? { kind: "choose" } : { kind: "typed" })}
            onRowClick={(r) => setSheet(r.source === "saved_meal" && r.portions != null ? { kind: "portions", row: r } : { kind: "typed", row: r })}
            onDelete={(r) => run(nutritionApi.removeEntry(r.id))}
            columns={[
              { key: "time", label: "Time", width: "44px", render: (r) => <span className="faint">{r.time}</span> },
              {
                key: "name", label: "Food", width: "1fr",
                render: (r) => (
                  <>
                    <div className="cell-main">{r.name}</div>
                    <div style={{ marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                      <Tag>{SOURCE_LABEL[r.source]}</Tag>
                      {r.portions != null && <span className="faint num">× {portionText(r)}</span>}
                    </div>
                  </>
                ),
              },
              { key: "cal", label: "kcal", width: "48px", align: "right", render: (r) => fmtNum(r.cal) },
              { key: "p", label: "P", width: "40px", align: "right", render: (r) => <span className="muted">{grams(r.p)}</span> },
            ]}
          />

          {days.length > 0 && (
            <>
              <SectionTitle>Logged days</SectionTitle>
              <DataTable
                rows={days.map((d) => ({ ...d, id: d.date }))}
                onRowClick={(r) => setDate(r.date)}
                columns={[
                  { key: "date", label: "Day", width: "1fr", render: (r) => `${fmtDow(r.date)} ${fmtDay(r.date)}` },
                  {
                    key: "cal", label: "kcal", width: "96px", align: "right",
                    render: (r) => (
                      <span className="num">
                        {fmtNum(r.cal)} <span className="faint">/ {fmtNum(r.calTarget)}</span>
                      </span>
                    ),
                  },
                  { key: "p", label: "P", width: "48px", align: "right", render: (r) => <span className="muted">{grams(r.p)}</span> },
                ]}
              />
            </>
          )}
        </>
      )}

      {view === "meals" && (
        <DataTable
          rows={meals}
          empty="No saved meals."
          onAdd={() => setSheet({ kind: "meal" })}
          onRowClick={(r) => setSheet({ kind: "meal", row: r })}
          onDelete={(r) => run(nutritionApi.removeMeal(r.id))}
          columns={[
            {
              key: "name", label: "Meal", width: "1fr",
              render: (r) => (
                <>
                  <div className="cell-main">{r.name}</div>
                  <div className="cell-sub">
                    per {r.unit}
                    {r.aliases.length > 0 && ` · ${r.aliases.join(", ")}`}
                  </div>
                </>
              ),
            },
            { key: "cal", label: "kcal", width: "44px", align: "right", render: (r) => r.cal },
            { key: "p", label: "P", width: "36px", align: "right", render: (r) => <span className="muted">{grams(r.p)}</span> },
            {
              key: "log", label: "", width: "52px", align: "right",
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheet({ kind: "logMeal", meal: r });
                  }}
                >
                  Log
                </button>
              ),
            },
          ]}
        />
      )}

      <Fab onClick={() => setSheet(view === "meals" ? { kind: "meal" } : meals.length ? { kind: "choose" } : { kind: "typed" })} />

      {sheet?.kind === "choose" && (
        <Sheet title="Add food" onClose={() => setSheet(null)}>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setSheet({ kind: "typed" })}>
              One-off
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSheet({ kind: "logMeal" })}>
              Saved meal
            </button>
          </div>
        </Sheet>
      )}

      {sheet?.kind === "typed" && (
        <FormSheet
          title={sheet.row ? "Edit entry" : "Add food"}
          fields={TYPED_FIELDS}
          confirm={!!sheet.row}
          validate={checkTyped}
          initial={sheet.row ? { ...sheet.row } : { date }}
          onClose={() => setSheet(null)}
          onDelete={sheet.row ? () => (run(nutritionApi.removeEntry(sheet.row!.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            const name = String(v.name).trim();
            const d = v.date as string;
            if (sheet.row) run(nutritionApi.updateTyped(sheet.row.id, d, name, macrosOf(v)));
            else run(nutritionApi.logTyped(d, name, macrosOf(v)));
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === "portions" && (
        <FormSheet
          title={sheet.row.name}
          fields={PORTION_FIELDS.map((f) => (f.name === "portions" ? { ...f, label: `Portions (${sheet.row.unit ?? "serving"})` } : f))}
          confirm
          validate={checkPortions}
          initial={{ portions: sheet.row.portions, date: sheet.row.date }}
          onClose={() => setSheet(null)}
          onDelete={() => (run(nutritionApi.removeEntry(sheet.row.id)), setSheet(null))}
          onSubmit={(v) => {
            run(nutritionApi.setPortions(sheet.row.id, v.date as string, v.portions as number));
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === "logMeal" && (
        <FormSheet
          title="Log saved meal"
          submitLabel="Log"
          fields={logMealFields}
          validate={(v) => (!meals.some((m) => mealLabel(m) === v.meal) ? "Pick a saved meal." : checkPortions(v))}
          initial={{ meal: mealLabel(sheet.meal ?? meals[0]), portions: 1, date }}
          onClose={() => setSheet(null)}
          onSubmit={(v) => {
            const meal = meals.find((m) => mealLabel(m) === v.meal)!;
            const d = v.date as string;
            run(nutritionApi.logMeal(d, meal.id, v.portions as number), `Logged ${meal.name} to ${fmtDay(d)}.`);
            setSheet(null);
          }}
        />
      )}

      {sheet?.kind === "meal" && (
        <FormSheet
          title={sheet.row ? "Edit saved meal" : "Add saved meal"}
          fields={MEAL_FIELDS}
          confirm={!!sheet.row}
          validate={checkMeal}
          initial={sheet.row ? { ...sheet.row, aliases: sheet.row.aliases.join(", ") } : { unit: "serving" }}
          onClose={() => setSheet(null)}
          onDelete={sheet.row ? () => (run(nutritionApi.removeMeal(sheet.row!.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            if (sheet.row) run(nutritionApi.updateMeal(sheet.row.id, mealOf(v)));
            else run(nutritionApi.saveMeal(mealOf(v)));
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}

export default function NutritionPage() {
  return (
    <Suspense>
      <Nutrition />
    </Suspense>
  );
}
