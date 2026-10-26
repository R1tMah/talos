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
import { spendingApi, useSpending, type SpendInput, type WriteResult } from "@/lib/spendingData";

const FIELDS: Field[] = [
  { name: "amount", label: "Amount ($)", type: "number", step: "0.01" },
  { name: "what", label: "What", placeholder: "Chipotle, Uber home, textbook…", full: true },
  { name: "category", label: "Category", type: "select", options: [...SPEND_CATEGORIES] },
  { name: "date", label: "Date", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional", full: true },
];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const toInput = (v: Record<string, unknown>): SpendInput => ({
  date: v.date as string,
  amount: Math.round((v.amount as number) * 100) / 100,
  what: String(v.what).trim(),
  category: v.category as SpendCategory,
  note: String(v.note ?? "").trim() || null,
});

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
          fields={FIELDS}
          confirm={sheet !== "new"}
          validate={(v) =>
            !finite(v.amount) || v.amount <= 0 ? "Amount must be more than 0." : !String(v.what ?? "").trim() ? "Say what it was." : !v.date ? "Date is required." : null
          }
          initial={
            sheet === "new"
              ? { amount: "", what: "", category: "Food & drink", date: isNow ? today : `${month}-01`, note: "" }
              : { amount: sheet.amount, what: sheet.what, category: sheet.category, date: sheet.date, note: sheet.note ?? "" }
          }
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(spendingApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={(v) => {
            run(sheet === "new" ? spendingApi.log(toInput(v)) : spendingApi.update(sheet.id, toInput(v)));
            setSheet(null);
          }}
        />
      )}
    </>
  );
}
