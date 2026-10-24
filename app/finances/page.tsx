"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { ExportButton } from "@/components/ExportButton";
import { FormSheet, type Field } from "@/components/FormSheet";
import { PlaidConnections } from "@/components/PlaidConnections";
import { PageSkeleton } from "@/components/Skeleton";
import { SummaryStrip } from "@/components/StatCard";
import { Fab, ScreenHeader, SectionTitle, Tag } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import { flow, fmtMoney, monthStart, vanguardTotal, type Holding, type Transaction } from "@/lib/finances";
import { financesApi, useFinances, type TransactionInput, type WriteResult } from "@/lib/financesData";
import { FLAGS } from "@/lib/flags";
import { financesExport } from "@/lib/screenExports";

// Finances: PNC checking (balance + transactions) and Vanguard holdings, synced from
// Plaid or entered by hand. Kept out of chat and the weekly review.

const TXN_FIELDS: Field[] = [
  { name: "kind", label: "Type", type: "select", options: ["Spent", "Received"] },
  { name: "amount", label: "Amount ($)", type: "number", step: "0.01" },
  { name: "description", label: "What", placeholder: "Chipotle, paycheck, Venmo from…", full: true },
  { name: "category", label: "Category", placeholder: "Optional: Food, Rent, Income…" },
  { name: "date", label: "Date", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional", full: true },
];

const BALANCE_FIELDS: Field[] = [
  { name: "balance", label: "Balance ($)", type: "number", step: "0.01" },
  { name: "date", label: "As of", type: "date" },
];

const HOLDING_FIELDS: Field[] = [
  { name: "fund", label: "Fund", placeholder: "VTSAX, Target Retirement 2065…", full: true },
  { name: "shares", label: "Shares", type: "number", step: "0.0001" },
  { name: "value", label: "Value ($)", type: "number", step: "0.01" },
];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validateTxn(v: Record<string, unknown>) {
  if (!finite(v.amount) || v.amount <= 0) return "Amount must be more than 0.";
  if (!String(v.description ?? "").trim()) return "Say what it was.";
  if (!v.date) return "Date is required.";
  return null;
}

const toTxn = (v: Record<string, unknown>): TransactionInput => ({
  date: v.date as string,
  amount: (v.kind === "Received" ? 1 : -1) * Math.round((v.amount as number) * 100) / 100,
  description: String(v.description).trim(),
  category: String(v.category ?? "").trim() || null,
  note: String(v.note ?? "").trim() || null,
});

export default function FinancesPage() {
  const { data, failed, reload } = useFinances();
  const [txnSheet, setTxnSheet] = useState<Transaction | "new" | null>(null);
  const [balanceSheet, setBalanceSheet] = useState(false);
  const [holdingSheet, setHoldingSheet] = useState<Holding | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const txns = useMemo(() => data?.transactions ?? [], [data]);

  const run = async (write: Promise<WriteResult>) => {
    setNotice(null);
    if ((await write).status !== "saved") setNotice("Failed");
    await reload();
  };

  if (!data) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="FINANCES" brand />
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

  const today = logicalToday();
  const month = flow(txns, monthStart(today));
  const checking = data.balance?.balance ?? null;
  const vanguard = vanguardTotal(data.holdings);

  return (
    <main className="screen">
      <ScreenHeader title="FINANCES" brand />

      <SummaryStrip
        items={[
          { label: "Checking", value: checking == null ? "–" : fmtMoney(checking), sub: data.balance ? `as of ${fmtDay(data.balance.date)}` : "not entered" },
          ...(FLAGS.vanguard
            ? [{ label: "Vanguard", value: vanguard == null ? "–" : fmtMoney(vanguard), sub: `${data.holdings.length} ${data.holdings.length === 1 ? "fund" : "funds"}` }]
            : []),
        ]}
      />

      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}

      <SectionTitle>Connections</SectionTitle>
      <PlaidConnections connections={data.connections} onChange={reload} />

      <SectionTitle
        right={
          <button type="button" className="btn btn-sm" onClick={() => setBalanceSheet(true)}>
            Update balance
          </button>
        }
      >
        PNC Checking
      </SectionTitle>
      <p className="faint num" style={{ fontSize: "var(--t-sm)", margin: "0 var(--s-1)" }}>
        This month: {fmtMoney(month.out)} out · {fmtMoney(month.in)} in
      </p>
      <DataTable
        rows={txns}
        empty="No transactions yet."
        onAdd={() => setTxnSheet("new")}
        onRowClick={(t) => setTxnSheet(t)}
        onDelete={(t) => run(financesApi.removeTransaction(t.id))}
        columns={[
          { key: "date", label: "Date", width: "50px", render: (t) => <span className="faint">{fmtDay(t.date)}</span> },
          {
            key: "what", label: "What", width: "1fr",
            render: (t) => (
              <>
                <div className="cell-main">
                  {t.description} {t.pending && <Tag tone="tag-outline">Pending</Tag>}
                </div>
                {(t.category || t.note) && <div className="cell-sub">{[t.category, t.note].filter(Boolean).join(" · ")}</div>}
              </>
            ),
          },
          {
            key: "amount", label: "Amount", width: "auto", align: "right",
            render: (t) => <span className="num" style={t.amount > 0 ? { color: "var(--accent)" } : undefined}>{fmtMoney(t.amount, { sign: true })}</span>,
          },
        ]}
      />

      {FLAGS.vanguard && (
        <>
          <SectionTitle
            right={
              <button type="button" className="btn btn-sm" onClick={() => setHoldingSheet("new")}>
                Add fund
              </button>
            }
          >
            Vanguard
          </SectionTitle>
          <DataTable
            rows={data.holdings}
            empty="No holdings yet."
            onAdd={() => setHoldingSheet("new")}
            onRowClick={(h) => setHoldingSheet(h)}
            onDelete={(h) => run(financesApi.removeHolding(h.id))}
            columns={[
              { key: "fund", label: "Fund", width: "1fr", render: (h) => <div className="cell-main">{h.fund}</div> },
              { key: "shares", label: "Shares", width: "auto", align: "right", render: (h) => <span className="num muted">{h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span> },
              { key: "value", label: "Value", width: "auto", align: "right", render: (h) => <span className="num">{fmtMoney(h.value)}</span> },
            ]}
          />
        </>
      )}

      <ExportButton tab="finances" source={financesExport(txns)} variant="button" />
      <Fab onClick={() => setTxnSheet("new")} label="Add transaction" />

      {txnSheet && (
        <FormSheet
          title={txnSheet === "new" ? "Add transaction" : "Edit transaction"}
          fields={TXN_FIELDS}
          confirm={txnSheet !== "new"}
          validate={validateTxn}
          initial={
            txnSheet === "new"
              ? { kind: "Spent", amount: "", description: "", category: "", date: today, note: "" }
              : {
                  kind: txnSheet.amount > 0 ? "Received" : "Spent", amount: Math.abs(txnSheet.amount), description: txnSheet.description,
                  category: txnSheet.category ?? "", date: txnSheet.date, note: txnSheet.note ?? "",
                }
          }
          onClose={() => setTxnSheet(null)}
          onDelete={txnSheet !== "new" ? () => (run(financesApi.removeTransaction(txnSheet.id)), setTxnSheet(null)) : undefined}
          onSubmit={(v) => {
            run(txnSheet === "new" ? financesApi.logTransaction(toTxn(v)) : financesApi.updateTransaction(txnSheet.id, toTxn(v)));
            setTxnSheet(null);
          }}
        />
      )}

      {balanceSheet && (
        <FormSheet
          title="Checking balance"
          fields={BALANCE_FIELDS}
          validate={(v) => (!finite(v.balance) ? "Enter the balance." : !v.date ? "Date is required." : null)}
          initial={{ balance: checking ?? "", date: today }}
          onClose={() => setBalanceSheet(false)}
          onSubmit={(v) => {
            run(financesApi.setBalance(v.date as string, Math.round((v.balance as number) * 100) / 100));
            setBalanceSheet(false);
          }}
        />
      )}

      {FLAGS.vanguard && holdingSheet && (
        <FormSheet
          title={holdingSheet === "new" ? "Add fund" : "Edit fund"}
          fields={HOLDING_FIELDS}
          confirm={holdingSheet !== "new"}
          validate={(v) =>
            !String(v.fund ?? "").trim() ? "Name the fund." : !finite(v.shares) || v.shares < 0 ? "Shares can't be negative." : !finite(v.value) || v.value < 0 ? "Value can't be negative." : null
          }
          initial={holdingSheet === "new" ? { fund: "", shares: "", value: "" } : { fund: holdingSheet.fund, shares: holdingSheet.shares, value: holdingSheet.value }}
          onClose={() => setHoldingSheet(null)}
          onDelete={holdingSheet !== "new" ? () => (run(financesApi.removeHolding(holdingSheet.id)), setHoldingSheet(null)) : undefined}
          onSubmit={(v) => {
            const h = { fund: String(v.fund).trim(), shares: v.shares as number, value: Math.round((v.value as number) * 100) / 100 };
            run(holdingSheet === "new" ? financesApi.addHolding(h) : financesApi.updateHolding(holdingSheet.id, h));
            setHoldingSheet(null);
          }}
        />
      )}
    </main>
  );
}
