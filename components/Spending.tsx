"use client";

// Finances > Spending: every time the owner spends money, by hand or from chat, out of
// curiosity about where it goes. Not the bank. A calendar month at a time (current month
// first), or the last 30 days whatever months they span.

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet, type Field } from "@/components/FormSheet";
import { IconBack, IconChevron } from "@/components/Icons";
import { SummaryStrip } from "@/components/StatCard";
import { SectionTitle, Segmented } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import { fmtMoney } from "@/lib/finances";
import { ROLLING_DAYS, SPENDING_SINCE, SPEND_CATEGORIES, monthLabel, monthOf, monthSummary, rollingSummary, shiftMonth, type Spend, type SpendCategory } from "@/lib/spending";
import { savedSpendsApi, spendingApi, useSavedSpends, useSpending, type SavedSpend, type SavedSpendInput, type SpendInput, type WriteResult } from "@/lib/spendingData";

/** The spending form, shared with Finances > Accounts' "add to spending" button. */
export const SPEND_FIELDS: Field[] = [
  { name: "amount", label: "Amount ($)", type: "number", step: "0.01" },
  { name: "what", label: "What", placeholder: "Chipotle, Uber home, textbook…", full: true },
  { name: "category", label: "Category", type: "select", options: [...SPEND_CATEGORIES] },
  { name: "date", label: "Date", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional", full: true },
];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const toSpendInput = (v: Record<string, unknown>): SpendInput => ({
  date: v.date as string,
  amount: Math.round((v.amount as number) * 100) / 100,
  what: String(v.what).trim(),
  category: v.category as SpendCategory,
  note: String(v.note ?? "").trim() || null,
});

export const checkSpend = (v: Record<string, unknown>) =>
  !finite(v.amount) || v.amount <= 0 ? "Amount must be more than 0." : !String(v.what ?? "").trim() ? "Say what it was." : !v.date ? "Date is required." : null;

export function SpendingView() {
  const { rows, failed, reload } = useSpending();
  const today = logicalToday();
  const [range, setRange] = useState<"month" | "rolling">("month");
  const [month, setMonth] = useState(() => monthOf(today));
  const [sheet, setSheet] = useState<Spend | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (write: Promise<WriteResult>) => {
    setNotice(null);
    if ((await write).status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!rows) {
    return failed ? (
      <p role="alert" className="muted">
        Failed.{" "}
        <button type="button" className="btn btn-sm" onClick={reload}>
          Retry
        </button>
      </p>
    ) : (
      <p className="faint">Loading…</p>
    );
  }

  const rolling = range === "rolling";
  const last = rolling ? rollingSummary(rows, today) : null;
  const m = last ?? monthSummary(rows, month, today);
  const isNow = rolling || month === monthOf(today);
  const period = last ? `${fmtDay(last.from)} – ${fmtDay(today)}` : monthLabel(month);

  return (
    <>
      <Segmented
        options={[{ value: "month", label: "Month" }, { value: "rolling", label: `Last ${ROLLING_DAYS} days` }]}
        value={range}
        onChange={setRange}
      />
      <div className="card pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--s-2) var(--s-3)", minHeight: 44 }}>
        {rolling ? (
          <span className="label" style={{ margin: "0 auto" }}>{period}</span>
        ) : (
          <>
            <button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= monthOf(SPENDING_SINCE)} onClick={() => setMonth(shiftMonth(month, -1))}>
              <IconBack />
            </button>
            <span className="label">{period}</span>
            <button type="button" className="icon-btn" aria-label="Next month" disabled={isNow} onClick={() => setMonth(shiftMonth(month, 1))}>
              <IconChevron />
            </button>
          </>
        )}
      </div>

      <SummaryStrip
        items={[
          { label: rolling ? `Last ${ROLLING_DAYS} days` : isNow ? "This month" : "Spent", value: fmtMoney(m.total), sub: `${m.count} ${m.count === 1 ? "purchase" : "purchases"}` },
          { label: "Per day", value: m.perDay == null ? "–" : fmtMoney(m.perDay), sub: last ? `over ${last.days} ${last.days === 1 ? "day" : "days"}` : isNow ? "so far" : "average" },
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      {m.categories.length > 0 && (
        <>
          <SectionTitle>Where it went</SectionTitle>
          <div className="card list" aria-label={`Spending by category, ${period}`}>
            {m.categories.map((c) => (
              <div key={c.category} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-2)" }}>
                  <span className="row-label">{c.category}</span>
                  <span className="num">
                    {fmtMoney(c.amount)} <span className="faint">{Math.round(c.share * 100)}%</span>
                  </span>
                </div>
                <div className="meter" aria-hidden>
                  <div style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SavedSpends date={isNow ? today : null} onDone={reload} />

      <SectionTitle>Purchases</SectionTitle>
      <DataTable
        rows={m.rows}
        empty={isNow ? `Nothing logged ${rolling ? `in the last ${ROLLING_DAYS} days` : "this month"}. Add one, or tell chat “spent $12 on lunch”.` : "Nothing logged this month."}
        onAdd={() => setSheet("new")}
        onRowClick={(s) => setSheet(s)}
        onDelete={(s) => run(spendingApi.remove(s.id))}
        columns={[
          { key: "date", label: "Date", width: "50px", render: (s) => <span className="faint">{fmtDay(s.date)}</span> },
          {
            key: "what", label: "What", width: "1fr",
            render: (s) => (
              <>
                <div className="cell-main">{s.what}</div>
                <div className="cell-sub">{[s.category, s.note].filter(Boolean).join(" · ")}</div>
              </>
            ),
          },
          { key: "amount", label: "Amount", width: "auto", align: "right", render: (s) => <span className="num">{fmtMoney(s.amount)}</span> },
        ]}
      />
      <button type="button" className="btn" onClick={() => setSheet("new")}>
        Add purchase
      </button>

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add purchase" : "Edit purchase"}
          fields={SPEND_FIELDS}
          confirm={sheet !== "new"}
          validate={checkSpend}
          initial={
            sheet === "new"
              ? { amount: "", what: "", category: "Food & drink", date: isNow ? today : `${month}-01`, note: "" }
              : { amount: sheet.amount, what: sheet.what, category: sheet.category, date: sheet.date, note: sheet.note ?? "" }
          }
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(spendingApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            run(sheet === "new" ? spendingApi.log(toSpendInput(v)) : spendingApi.update(sheet.id, toSpendInput(v)));
            setSheet(null);
          }}
        />
      )}
    </>
  );
}

// ---- Saved spendings ---------------------------------------------------------------------

const SAVED_FIELDS: Field[] = [
  { name: "name", label: "Name", placeholder: "Iced latte, gym day pass, Uber home…", full: true },
  { name: "amount", label: "Amount ($)", type: "number", step: "0.01", optional: true, placeholder: "Blank if it varies" },
  { name: "category", label: "Category", type: "select", options: [...SPEND_CATEGORIES] },
  { name: "aliases", label: "Other names (for chat)", placeholder: "latte, coffee", full: true, optional: true },
];

const toSavedInput = (v: Record<string, unknown>): SavedSpendInput => ({
  name: String(v.name).trim(),
  amount: finite(v.amount) ? Math.round(v.amount * 100) / 100 : null,
  category: v.category as SpendCategory,
  aliases: [...new Set(String(v.aliases ?? "").split(",").map((a) => a.trim()).filter(Boolean))],
});

const checkSaved = (v: Record<string, unknown>) =>
  !String(v.name ?? "").trim() ? "Give it a name." : finite(v.amount) && v.amount <= 0 ? "Amount must be more than 0, or blank." : null;

/**
 * Purchases made often, saved once. A tap logs one for today (a spending entry, with Undo);
 * one saved without an amount asks for it. Chat logs them by name too ("chipotle").
 * `date` is null when an earlier month is shown: logging is for today, so it's hidden then.
 */
function SavedSpends({ date, onDone }: { date: string | null; onDone: () => void }) {
  const { rows, reload } = useSavedSpends();
  const [edit, setEdit] = useState<SavedSpend | "new" | null>(null);
  const [ask, setAsk] = useState<SavedSpend | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const after = async (write: Promise<WriteResult>, conflict = "Failed.") => {
    setNotice(null);
    const out = (await write).status;
    if (out === "conflict") setNotice(conflict);
    else if (out !== "saved") setNotice("Failed.");
    await Promise.all([reload(), onDone()]);
  };
  const log = (s: SavedSpend, amount?: number) => date && after(savedSpendsApi.log(s.id, date, amount));

  if (!rows || !date) return null;
  return (
    <>
      <SectionTitle right={<button type="button" className="btn btn-sm" onClick={() => setEdit("new")}>Add</button>}>Saved</SectionTitle>
      {rows.length ? (
        <div className="card list" aria-label="Saved spendings">
          {rows.map((s) => (
            <div key={s.id} className="row">
              <button type="button" className="row-label saved-spend" onClick={() => (s.amount == null ? setAsk(s) : log(s))} aria-label={`Log ${s.name}`}>
                <span className="cell-main">{s.name}</span>
                <span className="cell-sub">{s.category}{s.amount == null ? " · amount each time" : ""}</span>
              </button>
              <span className="num">{s.amount == null ? "" : fmtMoney(s.amount)}</span>
              <button type="button" className="btn btn-sm" onClick={() => setEdit(s)} aria-label={`Edit ${s.name}`}>Edit</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="faint" style={{ fontSize: "var(--t-sm)", margin: 0 }}>
          Save things you buy often, then log them with one tap (or tell chat their name).
        </p>
      )}
      {notice && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>{notice}</p>}

      {edit && (
        <FormSheet
          title={edit === "new" ? "Save a spending" : `Edit ${edit.name}`}
          fields={SAVED_FIELDS}
          validate={checkSaved}
          initial={
            edit === "new"
              ? { name: "", amount: "", category: "Food & drink", aliases: "" }
              : { name: edit.name, amount: edit.amount ?? "", category: edit.category, aliases: edit.aliases.join(", ") }
          }
          onClose={() => setEdit(null)}
          onDelete={edit !== "new" ? () => (after(savedSpendsApi.remove(edit.id)), setEdit(null)) : undefined}
          onSubmit={(v) => {
            const input = toSavedInput(v);
            after(edit === "new" ? savedSpendsApi.save(input) : savedSpendsApi.update(edit.id, input), `There's already a saved spending named ${input.name}.`);
            setEdit(null);
          }}
        />
      )}

      {ask && (
        <FormSheet
          title={`Log ${ask.name}`}
          fields={[{ name: "amount", label: "Amount ($)", type: "number", step: "0.01", full: true }]}
          validate={(v) => (finite(v.amount) && v.amount > 0 ? null : "Amount must be more than 0.")}
          initial={{ amount: "" }}
          onClose={() => setAsk(null)}
          onSubmit={(v) => {
            log(ask, Math.round((v.amount as number) * 100) / 100);
            setAsk(null);
          }}
        />
      )}
    </>
  );
}
