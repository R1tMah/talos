"use client";

// Finances > Subscriptions: what the owner pays for on repeat, entered by hand (or from
// chat). Monthly and yearly totals count active subscriptions only; cancelled ones stay
// listed as history until deleted.

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { FormSheet, type Field } from "@/components/FormSheet";
import { SummaryStrip } from "@/components/StatCard";
import { Tag } from "@/components/ui";
import { fmtDay, logicalToday } from "@/lib/date";
import { fmtMoney } from "@/lib/finances";
import { CADENCES, isActive, perMonth, priceLabel, spend, type Cadence, type Subscription } from "@/lib/subscriptions";
import { subscriptionsApi, useSubscriptions, type SubscriptionInput, type WriteResult } from "@/lib/subscriptionsData";

const FIELDS: Field[] = [
  { name: "name", label: "Name", placeholder: "Spotify, Claude Pro…", full: true },
  { name: "amount", label: "Price ($)", type: "number", step: "0.01" },
  { name: "cadence", label: "Billed", type: "select", options: CADENCES },
  { name: "startedOn", label: "Started", type: "date" },
  { name: "note", label: "Note", placeholder: "Optional: card, renewal date…", full: true },
];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const toInput = (v: Record<string, unknown>): SubscriptionInput => ({
  name: String(v.name).trim(),
  amount: Math.round((v.amount as number) * 100) / 100,
  cadence: v.cadence as Cadence,
  startedOn: v.startedOn as string,
  note: String(v.note ?? "").trim() || null,
});

export function SubscriptionsView() {
  const { rows, failed, reload } = useSubscriptions();
  const [sheet, setSheet] = useState<Subscription | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = logicalToday();

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

  const total = spend(rows);

  return (
    <>
      <SummaryStrip
        items={[
          { label: "Per month", value: fmtMoney(total.monthly), sub: `${total.active} active` },
          { label: "Per year", value: fmtMoney(total.yearly), sub: "at current prices" },
        ]}
      />
      {notice && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--t-sm)", margin: 0 }}>
          {notice}
        </p>
      )}
      <DataTable
        rows={rows}
        empty="No subscriptions yet."
        onAdd={() => setSheet("new")}
        onRowClick={(s) => setSheet(s)}
        onDelete={(s) => run(subscriptionsApi.remove(s.id))}
        columns={[
          {
            key: "name", label: "Name", width: "1fr",
            render: (s) => (
              <>
                <div className="cell-main" style={isActive(s) ? undefined : { color: "var(--text-3)" }}>
                  {s.name} {!isActive(s) && <Tag tone="tag-outline">Cancelled</Tag>}
                </div>
                <div className="cell-sub">
                  {isActive(s) ? `Since ${fmtDay(s.startedOn)}` : `Cancelled ${fmtDay(s.cancelledOn!)}`}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </>
            ),
          },
          {
            key: "price", label: "Price", width: "auto", align: "right",
            render: (s) => (
              <>
                <div className="num">{priceLabel(s)}</div>
                {s.cadence !== "monthly" && isActive(s) && <div className="cell-sub num">{fmtMoney(perMonth(s))}/mo</div>}
              </>
            ),
          },
        ]}
      />
      <button type="button" className="btn" onClick={() => setSheet("new")}>
        Add subscription
      </button>

      {sheet && (
        <FormSheet
          title={sheet === "new" ? "Add subscription" : "Edit subscription"}
          fields={sheet === "new" ? FIELDS : [...FIELDS, { name: "status", label: "Status", type: "select", options: ["Active", "Cancelled"] }]}
          confirm={sheet !== "new"}
          validate={(v) =>
            !String(v.name ?? "").trim() ? "Name it." : !finite(v.amount) || v.amount <= 0 ? "Price must be more than 0." : !v.startedOn ? "Start date is required." : null
          }
          initial={
            sheet === "new"
              ? { name: "", amount: "", cadence: "monthly", startedOn: today, note: "" }
              : {
                  name: sheet.name, amount: sheet.amount, cadence: sheet.cadence, startedOn: sheet.startedOn, note: sheet.note ?? "",
                  status: isActive(sheet) ? "Active" : "Cancelled",
                }
          }
          onClose={() => setSheet(null)}
          onDelete={sheet !== "new" ? () => (run(subscriptionsApi.remove(sheet.id)), setSheet(null)) : undefined}
          onSubmit={async (v) => {
            const s = sheet;
            setSheet(null);
            if (s === "new") return run(subscriptionsApi.add(toInput(v)));
            await run(subscriptionsApi.update(s.id, toInput(v)));
            // Cancelling (today) or resuming is its own write, so Undo can take it back on its own.
            const cancel = v.status === "Cancelled";
            if (cancel !== !isActive(s)) await run(subscriptionsApi.setCancelled(s.id, cancel ? today : null));
          }}
        />
      )}
    </>
  );
}
