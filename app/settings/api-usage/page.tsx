"use client";

import { useMemo, useState } from "react";
import { PageSkeleton } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { ScreenHeader, Segmented } from "@/components/ui";
import { fmtUsd, PRICES, totals, useApiUsage } from "@/lib/apiUsage";
import { fmtNum, logicalToday } from "@/lib/date";

type Period = "today" | "7d" | "30d" | "all";

/** Start of the period as an ISO timestamp. "Today" starts at 4am, like the rest of the app. */
function sinceFor(p: Period): string | null {
  if (p === "all") return null;
  if (p === "today") {
    const [y, m, d] = logicalToday().split("-").map(Number);
    return new Date(y, m - 1, d, 4).toISOString();
  }
  return new Date(Date.now() - (p === "7d" ? 7 : 30) * 86_400_000).toISOString();
}

export default function ApiUsagePage() {
  const [period, setPeriod] = useState<Period>("30d");
  const since = useMemo(() => sinceFor(period), [period]);
  const { rows, failed, reload } = useApiUsage(since);

  if (!rows) {
    return failed ? (
      <main className="screen">
        <ScreenHeader title="API usage" back="/settings" />
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

  const models = totals(rows);
  const cost = models.reduce((s, m) => s + (m.cost ?? 0), 0);
  const unpriced = models.filter((m) => m.cost == null).map((m) => m.model);
  const tokensIn = models.reduce((s, m) => s + m.input + m.cacheWrite + m.cacheRead, 0);
  const tokensOut = models.reduce((s, m) => s + m.output, 0);

  return (
    <main className="screen">
      <ScreenHeader title="API usage" back="/settings" />
      <div className="card pad" style={{ padding: "var(--s-2)" }}>
        <Segmented
          options={[
            { value: "today", label: "Today" },
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
            { value: "all", label: "All" },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <div className="grid-2">
        <StatCard
          title="Cost"
          value={fmtUsd(cost)}
          accent
          rows={[
            { label: "Calls", value: fmtNum(rows.length) },
            { label: "Per call", value: rows.length ? fmtUsd(cost / rows.length) : "–" },
          ]}
        />
        <StatCard
          title="Tokens"
          value={fmtNum(tokensIn + tokensOut)}
          rows={[
            { label: "Input", value: fmtNum(tokensIn) },
            { label: "Output", value: fmtNum(tokensOut) },
          ]}
        />
      </div>

      {models.length > 0 && (
        <>
          <span className="label group-title">By model</span>
          <div className="card list">
            {models.map((m) => (
              <div key={m.model} className="row">
                <span className="row-label">
                  {m.model}
                  <span className="cell-sub num" style={{ display: "block" }}>
                    {fmtNum(m.calls)} calls · {fmtNum(m.input + m.cacheWrite + m.cacheRead)} in · {fmtNum(m.output)} out
                  </span>
                </span>
                <span className="row-value num">{m.cost == null ? "No price" : fmtUsd(m.cost)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="faint" style={{ fontSize: "var(--t-xs)", margin: "0 var(--s-4)" }}>
        Counts every chat message that went to the model, from the token counts Anthropic returns.
        Rule-matched messages (a bare weight, a saved meal) don&rsquo;t call the API and cost nothing.
        Other apps using the same key aren&rsquo;t included. Prices:{" "}
        {Object.entries(PRICES)
          .map(([id, p]) => `${id} $${p.input} in / $${p.output} out per 1M tokens`)
          .join("; ")}
        .{unpriced.length > 0 && ` No price listed for ${unpriced.join(", ")}.`}
      </p>
    </main>
  );
}
