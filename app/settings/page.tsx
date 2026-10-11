"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormSheet, Sheet } from "@/components/FormSheet";
import { IconChevron } from "@/components/Icons";
import { ScreenHeader, Segmented } from "@/components/ui";
import { addDays, fmtDay, fmtNum, newestFirst, todayISO, uid, weekStart } from "@/lib/date";
import { countBy, dayTotals, inWeek, live, mean, weekSummary } from "@/lib/stats";
import { useStore } from "@/lib/store";
import type { DB, Plan, Settings } from "@/lib/types";

type Edit = "targets" | "rest" | "aliases" | "plans" | "statuses" | "context" | { plan: Plan | "new" } | null;
type Theme = "system" | "dark" | "light";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Plain data for an outside review. Numbers and the owner's own words only. */
function reviewPacket(db: DB) {
  const today = todayISO();
  const wk = weekStart(today);
  const w = live(db.weight);
  const out: string[] = [`# TALOS review packet, ${fmtDay(today)}`, "", "## Context", db.settings.context, ""];

  out.push("## Weight (weekly average)", "| Week of | Avg lb | Days |", "|---|---|---|");
  for (let i = 0; i < 4; i++) {
    const s = weekSummary(w, addDays(wk, -7 * i));
    out.push(`| ${fmtDay(addDays(wk, -7 * i))} | ${s.avg?.toFixed(1) ?? "–"} | ${s.days} |`);
  }

  const days = Array.from({ length: 7 }, (_, i) => dayTotals(live(db.food), addDays(today, -i))).filter((d) => d.cal > 0);
  out.push(
    "", "## Nutrition (7-day average of logged days)",
    `- Calories: ${fmtNum(mean(days.map((d) => d.cal)) ?? 0)} / ${db.settings.calories}`,
    `- Protein: ${Math.round(mean(days.map((d) => d.p)) ?? 0)} / ${db.settings.protein} g`,
    `- Days logged: ${days.length}`,
  );

  const lc = inWeek(live(db.leetcode)).sort(newestFirst);
  out.push("", "## LeetCode this week", ...lc.map((l) => `- ${fmtDay(l.date)} ${l.problem} (${l.difficulty}, ${l.result}, ${l.minutes} min)`));
  out.push(`- Redo queue: ${live(db.leetcode).filter((l) => l.redo).length}`);

  const apps = countBy(live(db.applications), (a) => a.status);
  out.push("", "## Applications", ...db.settings.statuses.map((s) => `- ${s}: ${apps[s] ?? 0}`));

  out.push("", "## Callbacks");
  for (const c of live(db.callbacks).sort(newestFirst).slice(0, 5)) {
    out.push(`### ${fmtDay(c.date)} ${c.company}, ${c.type}, ${c.stage}`, c.debrief || "(no debrief)", "");
  }

  const wo = inWeek(live(db.workouts)).sort(newestFirst);
  out.push("## Workouts this week", ...wo.map((x) => `- ${fmtDay(x.date)} ${x.plan}, ${x.sets.length} sets, ${x.minutes} min`));
  return out.join("\n");
}

function Row({ label, value, onClick, href }: { label: string; value?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="row-label">{label}</span>
      {value && <span className="row-value num">{value}</span>}
      <IconChevron />
    </>
  );
  return href ? (
    <Link href={href} className="row">
      {inner}
    </Link>
  ) : (
    <button type="button" className="row" onClick={onClick}>
      {inner}
    </button>
  );
}

export default function SettingsPage() {
  const { db, mutate, add, update } = useStore();
  const s = db.settings;
  const [edit, setEdit] = useState<Edit>(null);
  const [copy, setCopy] = useState<"" | "Copied" | "Failed">("");
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("talos.theme") as Theme) || "system");
    } catch {}
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("talos.theme");
      else localStorage.setItem("talos.theme", t);
    } catch {}
  };

  const save = (patch: Partial<Settings>) => {
    mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    setEdit(null);
  };

  const exportPacket = async () => {
    try {
      await navigator.clipboard.writeText(reviewPacket(db));
      setCopy("Copied");
    } catch {
      setCopy("Failed");
    }
    setTimeout(() => setCopy(""), 2000);
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify({ ...db, chat: [] }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `talos-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const plans = live(db.plans);

  return (
    <main className="screen">
      <ScreenHeader title="Settings" />

      <span className="label group-title">Targets</span>
      <div className="card list">
        <Row label="Calories" value={`${fmtNum(s.calories)} kcal`} onClick={() => setEdit("targets")} />
        <Row label="Protein" value={`${s.protein} g`} onClick={() => setEdit("targets")} />
        <Row label="Carbs" value={`${s.carbs} g`} onClick={() => setEdit("targets")} />
        <Row label="Fat" value={`${s.fat} g`} onClick={() => setEdit("targets")} />
      </div>

      <span className="label group-title">Workout</span>
      <div className="card list">
        <Row label="Rest time" value={`${s.restSec} s`} onClick={() => setEdit("rest")} />
        <Row label="Plans" value={plans.map((p) => p.name).join(", ")} onClick={() => setEdit("plans")} />
      </div>

      <span className="label group-title">Logging</span>
      <div className="card list">
        <Row label="Aliases" value={String(s.aliases.length)} onClick={() => setEdit("aliases")} />
        <Row label="Saved meals" value={String(live(db.meals).length)} href="/tabs/nutrition?view=meals" />
        <Row label="Statuses" value={String(s.statuses.length)} onClick={() => setEdit("statuses")} />
        <Row label="Context blurb" value={s.context ? `${s.context.length} chars` : "Empty"} onClick={() => setEdit("context")} />
      </div>

      <span className="label group-title">Appearance</span>
      <div className="card pad" style={{ padding: "var(--s-2)" }}>
        <Segmented
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          value={theme}
          onChange={applyTheme}
        />
      </div>

      <span className="label group-title">Data</span>
      <div className="card list">
        <button type="button" className="row" onClick={exportPacket}>
          <span className="row-label">Export review packet</span>
          <span className="row-value" style={{ color: copy === "Failed" ? "var(--danger)" : copy ? "var(--accent)" : undefined }}>
            {copy || "Copy markdown"}
          </span>
        </button>
        <button type="button" className="row" onClick={backup}>
          <span className="row-label">Download backup</span>
          <span className="row-value">JSON</span>
        </button>
      </div>

      {edit === "targets" && (
        <FormSheet
          title="Targets"
          confirm
          fields={[
            { name: "calories", label: "Calories", type: "number" },
            { name: "protein", label: "Protein (g)", type: "number" },
            { name: "carbs", label: "Carbs (g)", type: "number" },
            { name: "fat", label: "Fat (g)", type: "number" },
          ]}
          initial={s}
          onClose={() => setEdit(null)}
          onSubmit={(v) => save(v as Partial<Settings>)}
        />
      )}
      {edit === "rest" && (
        <FormSheet
          title="Rest time"
          confirm
          fields={[{ name: "restSec", label: "Seconds", type: "number", full: true }]}
          initial={s}
          onClose={() => setEdit(null)}
          onSubmit={(v) => save(v as Partial<Settings>)}
        />
      )}
      {edit === "aliases" && (
        <FormSheet
          title="Aliases"
          confirm
          fields={[{ name: "aliases", label: "One per line: short = expansion", type: "textarea" }]}
          initial={{ aliases: s.aliases.map((a) => `${a.from} = ${a.to}`).join("\n") }}
          onClose={() => setEdit(null)}
          onSubmit={(v) =>
            save({
              aliases: lines(v.aliases as string)
                .map((l) => l.split("=").map((x) => x.trim()))
                .filter(([a, b]) => a && b)
                .map(([from, to]) => ({ from, to })),
            })
          }
        />
      )}
      {edit === "statuses" && (
        <FormSheet
          title="Application statuses"
          confirm
          fields={[{ name: "statuses", label: "One per line, in order", type: "textarea" }]}
          initial={{ statuses: s.statuses.join("\n") }}
          onClose={() => setEdit(null)}
          onSubmit={(v) => save({ statuses: lines(v.statuses as string) })}
        />
      )}
      {edit === "context" && (
        <FormSheet
          title="Context blurb"
          confirm
          fields={[{ name: "context", label: "Included in the review packet", type: "textarea" }]}
          initial={s}
          onClose={() => setEdit(null)}
          onSubmit={(v) => save({ context: v.context as string })}
        />
      )}
      {edit === "plans" && (
        <Sheet title="Plans" onClose={() => setEdit(null)}>
          <div className="card list">
            {plans.map((p) => (
              <Row key={p.id} label={p.name} value={`${p.exercises.length} exercises`} onClick={() => setEdit({ plan: p })} />
            ))}
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setEdit({ plan: "new" })}>
              Add plan
            </button>
          </div>
        </Sheet>
      )}
      {edit && typeof edit === "object" && (
        <FormSheet
          title={edit.plan === "new" ? "New plan" : "Edit plan"}
          confirm={edit.plan !== "new"}
          fields={[
            { name: "name", label: "Name" },
            { name: "exercises", label: "Exercises, one per line", type: "textarea" },
          ]}
          initial={edit.plan === "new" ? {} : { name: edit.plan.name, exercises: edit.plan.exercises.join("\n") }}
          onClose={() => setEdit("plans")}
          onDelete={
            edit.plan !== "new"
              ? () => {
                  update("plans", (edit.plan as Plan).id, { deleted: true });
                  setEdit("plans");
                }
              : undefined
          }
          onSubmit={(v) => {
            const data = { name: v.name as string, exercises: lines(v.exercises as string) };
            if (edit.plan === "new") add("plans", { id: uid(), ...data });
            else update("plans", edit.plan.id, data);
            setEdit("plans");
          }}
        />
      )}
    </main>
  );
}
