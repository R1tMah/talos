"use client";

import { useState } from "react";
import { fmtNum } from "@/lib/date";
import type { Food, Meal, MealItem } from "@/lib/nutritionData";
import type { Change } from "@/lib/types";
import { ChangeList } from "./ChangeList";
import { Sheet } from "./FormSheet";
import { Stepper } from "./ui";

const g = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "Chipotle White Rice, 2× Chipotle Chicken, ..." */
export function itemsSummary(items: MealItem[], foods: Map<string, Food>) {
  return items
    .map((i) => {
      const name = foods.get(i.foodId)?.name ?? "Unknown food";
      return i.servings === 1 ? name : `${g(i.servings)}× ${name}`;
    })
    .join(", ");
}

export function sumItems(items: MealItem[], foods: Map<string, Food>) {
  return items.reduce(
    (t, i) => {
      const f = foods.get(i.foodId);
      return f ? { cal: t.cal + f.cal * i.servings, p: t.p + f.p * i.servings } : t;
    },
    { cal: 0, p: 0 },
  );
}

// ---- Meal overview -----------------------------------------------------------------

export function MealSheet({
  meal, foods, onClose, onEditDetails, onEditIngredients, onLog,
}: {
  meal: Meal;
  foods: Map<string, Food>;
  onClose: () => void;
  onEditDetails: () => void;
  onEditIngredients: () => void;
  onLog: () => void;
}) {
  const sum = sumItems(meal.items, foods);
  return (
    <Sheet title={meal.name} onClose={onClose}>
      <div className="totals-line num">
        <span className="muted">Meal total, per {meal.unit}</span>
        <span>
          {fmtNum(meal.cal)} cal · {g(meal.p)} g
        </span>
      </div>
      {meal.items.length ? (
        <>
          <div className="card pad ing-list" style={{ padding: "var(--s-1) var(--s-4)" }}>
            {meal.items.map((i) => {
              const f = foods.get(i.foodId);
              return (
                <div key={i.foodId} className="ing-row num">
                  <span className="ing-name">
                    <span className="cell-main">{f?.name ?? "Unknown food"}</span>
                  </span>
                  <span className="faint">{g(i.servings)}×</span>
                  <span style={{ minWidth: 56, textAlign: "right" }}>{f ? fmtNum(f.cal * i.servings) : "–"}</span>
                </div>
              );
            })}
          </div>
          <div className="totals-line num faint">
            <span>Ingredients add up to</span>
            <span>
              {fmtNum(sum.cal)} cal · {g(sum.p)} g
            </span>
          </div>
        </>
      ) : (
        <p className="faint" style={{ fontSize: "var(--t-sm)" }}>
          No ingredients tagged.
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onEditDetails}>
          Details
        </button>
        <button type="button" className="btn" onClick={onEditIngredients}>
          Ingredients
        </button>
        <button type="button" className="btn btn-primary" onClick={onLog}>
          Log
        </button>
      </div>
    </Sheet>
  );
}

// ---- Ingredient editor ---------------------------------------------------------------

export function IngredientsSheet({
  meal, foods, onClose, onSave,
}: {
  meal: Meal;
  foods: Food[];
  onClose: () => void;
  onSave: (items: MealItem[]) => void;
}) {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const [rows, setRows] = useState<MealItem[]>(meal.items);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const available = foods.filter((f) => !rows.some((r) => r.foodId === f.id));
  const kept = rows.filter((r) => r.servings > 0);
  const sum = sumItems(kept, byId);

  const set = (foodId: string, servings: number) => setRows(rows.map((r) => (r.foodId === foodId ? { ...r, servings } : r)));

  const review = () => {
    const ids = [...new Set([...meal.items.map((i) => i.foodId), ...kept.map((i) => i.foodId)])];
    const diff = ids
      .map((id) => {
        const before = meal.items.find((i) => i.foodId === id)?.servings;
        const after = kept.find((i) => i.foodId === id)?.servings;
        return { id, before, after };
      })
      .filter((d) => d.before !== d.after)
      .map((d) => ({
        field: byId.get(d.id)?.name ?? "Unknown food",
        from: d.before == null ? "not included" : `${g(d.before)}×`,
        to: d.after == null ? "removed" : `${g(d.after)}×`,
      }));
    if (!diff.length) return onClose();
    setChanges(diff);
  };

  return (
    <Sheet title={changes ? "Confirm ingredients" : `Ingredients · ${meal.name}`} onClose={onClose}>
      {changes ? (
        <ChangeList changes={changes} />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="ing-list">
              {rows.map((r) => {
                const f = byId.get(r.foodId);
                return (
                  <div key={r.foodId} className={`ing-row${r.servings === 0 ? " removed" : ""}`}>
                    <span className="ing-name">
                      <span className="cell-main">{f?.name ?? "Unknown food"}</span>
                      <span className="cell-sub num">
                        {f ? `${fmtNum(f.cal)} cal · ${g(f.p)} g per ${g(f.amount)} ${f.unit}` : ""}
                      </span>
                    </span>
                    <Stepper label={`servings of ${f?.name ?? "food"}`} value={r.servings} step={0.5} onChange={(v) => set(r.foodId, v)} />
                  </div>
                );
              })}
            </div>
          )}
          <label className="field" style={{ marginTop: "var(--s-3)" }}>
            <span className="label">Add ingredient</span>
            <select
              className="input"
              value=""
              disabled={!available.length}
              onChange={(e) => e.target.value && setRows([...rows, { foodId: e.target.value, servings: 1 }])}
            >
              <option value="">{available.length ? "Choose a food" : "Every food is already listed"}</option>
              {available.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <div className="totals-line num">
            <span className="muted">Ingredients add up to</span>
            <span>
              {fmtNum(sum.cal)} cal · {g(sum.p)} g
            </span>
          </div>
          <div className="totals-line num faint" style={{ paddingTop: 0 }}>
            <span>Meal total (unchanged)</span>
            <span>
              {fmtNum(meal.cal)} cal · {g(meal.p)} g
            </span>
          </div>
        </>
      )}
      <div className="sheet-actions">
        {changes ? (
          <>
            <button type="button" className="btn" onClick={() => setChanges(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onSave(kept)}>
              Confirm
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={review}>
            Save
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---- Log a saved meal, optionally leaving some of it out -------------------------------

export function LogMealSheet({
  meals, foods, initialMealId, initialDate, onClose, onLog,
}: {
  meals: Meal[];
  foods: Map<string, Food>;
  initialMealId?: string;
  initialDate: string;
  onClose: () => void;
  onLog: (mealId: string, portions: number, date: string, minus: MealItem[]) => void;
}) {
  const [mealId, setMealId] = useState(initialMealId ?? meals[0]?.id ?? "");
  const [portions, setPortions] = useState(1);
  const [date, setDate] = useState(initialDate);
  const [eaten, setEaten] = useState<Record<string, number>>({});
  const meal = meals.find((m) => m.id === mealId);

  if (!meal) {
    return (
      <Sheet title="Log saved meal" onClose={onClose}>
        <p className="faint">No saved meals.</p>
      </Sheet>
    );
  }

  const eatenOf = (i: MealItem) => eaten[i.foodId] ?? i.servings;
  const minus = meal.items.map((i) => ({ foodId: i.foodId, servings: +(i.servings - eatenOf(i)).toFixed(2) })).filter((m) => m.servings > 0);
  const less = sumItems(minus, foods);
  // Preview only; the database does the real math.
  const cal = Math.max(0, Math.round((meal.cal - less.cal) * portions));
  const p = Math.max(0, Math.round((meal.p - less.p) * portions * 10) / 10);

  return (
    <Sheet title="Log saved meal" onClose={onClose}>
      <div className="form">
        <label className="field full">
          <span className="label">Saved meal</span>
          <select
            className="input"
            value={mealId}
            onChange={(e) => {
              setMealId(e.target.value);
              setEaten({});
            }}
          >
            {meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="label">Portions ({meal.unit})</span>
          <Stepper label="portions" value={portions} min={0.5} step={0.5} onChange={setPortions} />
        </div>
        <label className="field">
          <span className="label">Date</span>
          <input className="input num" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {meal.items.length > 0 && (
        <>
          <div className="section-title" style={{ margin: "var(--s-4) 0 var(--s-1)" }}>
            <span className="label">What you had</span>
            {minus.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEaten({})}>
                Reset
              </button>
            )}
          </div>
          <div className="ing-list">
            {meal.items.map((i) => {
              const f = foods.get(i.foodId);
              const v = eatenOf(i);
              return (
                <div key={i.foodId} className={`ing-row${v === 0 ? " removed" : ""}`}>
                  <span className="ing-name">
                    <span className="cell-main">{f?.name ?? "Unknown food"}</span>
                    <span className="cell-sub num">of {g(i.servings)}</span>
                  </span>
                  <Stepper
                    label={`servings of ${f?.name ?? "food"}`}
                    value={v}
                    max={i.servings}
                    step={i.servings % 1 === 0 ? 1 : 0.5}
                    onChange={(n) => setEaten({ ...eaten, [i.foodId]: n })}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="totals-line num" style={{ marginTop: "var(--s-2)" }}>
        <span className="muted">Logs</span>
        <span>
          {fmtNum(cal)} cal · {g(p)} g
        </span>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn btn-primary" disabled={!date} onClick={() => onLog(meal.id, portions, date, minus)}>
          Log
        </button>
      </div>
    </Sheet>
  );
}
