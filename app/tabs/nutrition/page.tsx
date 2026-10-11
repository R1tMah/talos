"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet, type Field } from "@/components/FormSheet";
import { IconBack, IconChevron } from "@/components/Icons";
import { Fab, ScreenHeader, SectionTitle, Segmented, Tag } from "@/components/ui";
import { addDays, fmtDay, fmtDow, fmtNum, fromISO, newestFirst, nowHM, todayISO, uid, weekStart } from "@/lib/date";
import { dayTotals, live } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { Food, FoodEntry, SavedMeal } from "@/lib/types";

type View = "log" | "foods" | "meals";

const MACROS: Field[] = [
  { name: "cal", label: "Calories", type: "number" },
  { name: "p", label: "Protein (g)", type: "number" },
  { name: "c", label: "Carbs (g)", type: "number" },
  { name: "f", label: "Fat (g)", type: "number" },
];

const ENTRY_FIELDS: Field[] = [
  { name: "name", label: "Food" },
  ...MACROS,
  { name: "date", label: "Date", type: "date" },
  { name: "time", label: "Time", type: "time" },
  { name: "source", label: "Source", type: "select", options: ["typed", "saved", "estimate"], full: true },
];

const FOOD_FIELDS: Field[] = [{ name: "name", label: "Name" }, { name: "serving", label: "Serving", full: true }, ...MACROS];
const MEAL_FIELDS: Field[] = [{ name: "name", label: "Name" }, { name: "items", label: "Items" }, ...MACROS];

const pct = (v: number, t: number) => `${Math.min(100, t ? (v / t) * 100 : 0)}%`;

function Nutrition() {
  const params = useSearchParams();
  const { db, add, update, remove } = useStore();
  const today = todayISO();
  const [view, setView] = useState<View>((params.get("view") as View) || "log");
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState<{ kind: View; row?: FoodEntry | Food | SavedMeal } | null>(null);

  const food = useMemo(() => live(db.food), [db.food]);
  const entries = food.filter((e) => e.date === date).sort(newestFirst);
  const t = dayTotals(food, date);
  const s = db.settings;
  const ws = weekStart(date);
  const loggedDays = new Set(food.map((e) => e.date));

  const logMeal = (m: SavedMeal) =>
    add("food", { id: uid(), date, time: nowHM(), name: m.name, cal: m.cal, p: m.p, c: m.c, f: m.f, source: "saved" });

  return (
    <main className="screen">
      <ScreenHeader title="Nutrition" back="/tabs" />
      <Segmented
        options={[
          { value: "log", label: "Log" },
          { value: "foods", label: "Foods" },
          { value: "meals", label: "Saved meals" },
        ]}
        value={view}
        onChange={setView}
      />

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
                  {fmtNum(t.cal)} <small>/ {fmtNum(s.calories)}</small>
                </div>
                <div className="meter" style={{ marginTop: 8 }}>
                  <div style={{ width: pct(t.cal, s.calories) }} />
                </div>
              </div>
              <div>
                <div className="macro-head">
                  <span className="label">Protein</span>
                </div>
                <div className="macro-big num">
                  {t.p} <small>/ {s.protein} g</small>
                </div>
                <div className="meter" style={{ marginTop: 8 }}>
                  <div style={{ width: pct(t.p, s.protein) }} />
                </div>
              </div>
              {(
                [
                  ["Carbs", t.c, s.carbs],
                  ["Fat", t.f, s.fat],
                ] as const
              ).map(([label, v, target]) => (
                <div key={label}>
                  <div className="macro-head">
                    <span className="label">{label}</span>
                    <span className="macro-small num">
                      {v} <small>/ {target} g</small>
                    </span>
                  </div>
                  <div className="meter neutral">
                    <div style={{ width: pct(v, target) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SectionTitle>
            {date === today ? "Today" : `${fmtDow(date)} ${fmtDay(date)}`}, {entries.length} entries
          </SectionTitle>
          <DataTable
            rows={entries}
            empty="Nothing logged this day."
            onAdd={() => setSheet({ kind: "log" })}
            onRowClick={(r) => setSheet({ kind: "log", row: r })}
            onDelete={(r) => remove("food", r.id)}
            columns={[
              { key: "time", label: "Time", width: "44px", render: (r) => <span className="faint">{r.time}</span> },
              {
                key: "name", label: "Food", width: "1fr",
                render: (r) => (
                  <>
                    <div className="cell-main">{r.name}</div>
                    <div style={{ marginTop: 3 }}>
                      <Tag>{r.source}</Tag>
                    </div>
                  </>
                ),
              },
              { key: "cal", label: "kcal", width: "48px", align: "right", render: (r) => fmtNum(r.cal) },
              { key: "p", label: "P", width: "36px", align: "right", render: (r) => <span className="muted">{r.p}</span> },
            ]}
          />
        </>
      )}

      {view === "foods" && (
        <DataTable
          rows={live(db.foods).sort((a, b) => a.name.localeCompare(b.name))}
          empty="No foods saved."
          onAdd={() => setSheet({ kind: "foods" })}
          onRowClick={(r) => setSheet({ kind: "foods", row: r })}
          onDelete={(r) => remove("foods", r.id)}
          columns={[
            {
              key: "name", label: "Food", width: "1fr",
              render: (r) => (
                <>
                  <div className="cell-main">{r.name}</div>
                  <div className="cell-sub">{r.serving}</div>
                </>
              ),
            },
            { key: "cal", label: "kcal", width: "44px", align: "right", render: (r) => r.cal },
            { key: "p", label: "P", width: "30px", align: "right", render: (r) => <span className="muted">{r.p}</span> },
            { key: "c", label: "C", width: "30px", align: "right", render: (r) => <span className="muted">{r.c}</span> },
            { key: "f", label: "F", width: "30px", align: "right", render: (r) => <span className="muted">{r.f}</span> },
          ]}
        />
      )}

      {view === "meals" && (
        <DataTable
          rows={live(db.meals).sort((a, b) => a.name.localeCompare(b.name))}
          empty="No saved meals."
          onAdd={() => setSheet({ kind: "meals" })}
          onRowClick={(r) => setSheet({ kind: "meals", row: r })}
          onDelete={(r) => remove("meals", r.id)}
          columns={[
            {
              key: "name", label: "Meal", width: "1fr",
              render: (r) => (
                <>
                  <div className="cell-main">{r.name}</div>
                  <div className="cell-sub">{r.items}</div>
                </>
              ),
            },
            { key: "cal", label: "kcal", width: "44px", align: "right", render: (r) => r.cal },
            { key: "p", label: "P", width: "28px", align: "right", render: (r) => <span className="muted">{r.p}</span> },
            {
              key: "log", label: "", width: "52px", align: "right",
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    logMeal(r);
                  }}
                >
                  Log
                </button>
              ),
            },
          ]}
        />
      )}

      <Fab onClick={() => setSheet({ kind: view })} />

      {sheet?.kind === "log" && (
        <FormSheet
          title={sheet.row ? "Edit entry" : "Add food"}
          fields={ENTRY_FIELDS}
          confirm={!!sheet.row}
          initial={sheet.row ?? { date, time: nowHM(), source: "typed", cal: "", p: "", c: "", f: "" }}
          onClose={() => setSheet(null)}
          onDelete={sheet.row ? () => (remove("food", sheet.row!.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            if (sheet.row) update("food", sheet.row.id, v as Partial<FoodEntry>);
            else add("food", { id: uid(), ...(v as Omit<FoodEntry, "id">) });
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "foods" && (
        <FormSheet
          title={sheet.row ? "Edit food" : "Add food"}
          fields={FOOD_FIELDS}
          confirm={!!sheet.row}
          initial={sheet.row ?? { serving: "1 serving" }}
          onClose={() => setSheet(null)}
          onDelete={sheet.row ? () => (remove("foods", sheet.row!.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            if (sheet.row) update("foods", sheet.row.id, v as Partial<Food>);
            else add("foods", { id: uid(), ...(v as Omit<Food, "id">) });
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "meals" && (
        <FormSheet
          title={sheet.row ? "Edit saved meal" : "Add saved meal"}
          fields={MEAL_FIELDS}
          confirm={!!sheet.row}
          initial={sheet.row ?? {}}
          onClose={() => setSheet(null)}
          onDelete={sheet.row ? () => (remove("meals", sheet.row!.id), setSheet(null)) : undefined}
          onSubmit={(v) => {
            if (sheet.row) update("meals", sheet.row.id, v as Partial<SavedMeal>);
            else add("meals", { id: uid(), ...(v as Omit<SavedMeal, "id">) });
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
