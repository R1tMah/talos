"use client";

import { createClient } from "@/utils/supabase/client";
import { addDays, fmtDay, fmtNum, logicalToday, weekStart } from "./date";
import { fmtDuration } from "./duration";
import { FLAGS } from "./flags";

/**
 * The "review packet": one markdown summary for an outside review, read from
 * Supabase when it's exported. Numbers and the owner's own words only; nothing here
 * is generated, judged or rewritten. Archived tabs are left out.
 */
export async function buildReviewPacket(): Promise<string> {
  const db = createClient();
  const today = logicalToday();
  const wk = weekStart(today);
  const weeks = [0, 1, 2, 3].map((i) => addDays(wk, -7 * i));
  const weekEnd = addDays(wk, 6);
  const fail = (what: string) => {
    throw new Error(`review packet: ${what}`);
  };

  const [settings, weekly, days, targets, runs, lc, redo, apps, reminders, callbacks, workouts] = await Promise.all([
    db.from("settings").select("context_blurb, archived_tabs").eq("id", 1).single(),
    db.from("weekly_weights").select("*").in("week_start", weeks),
    db.from("daily_totals").select("*").gte("logical_date", addDays(today, -6)).lte("logical_date", today),
    db.rpc("targets_for", { p_date: today }).single(),
    db.from("runs").select("*").is("deleted_at", null).gte("logical_date", wk).lte("logical_date", weekEnd).order("logical_date"),
    db.from("leetcode_log").select("*").is("deleted_at", null).gte("logical_date", wk).lte("logical_date", weekEnd)
      .order("logical_date").order("created_at"),
    db.from("redo_queue").select("id", { count: "exact", head: true }),
    db.from("applications").select("status").is("deleted_at", null),
    db.from("open_application_reminders").select("*"),
    db.from("callbacks").select("*").is("deleted_at", null)
      .order("logical_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(5),
    FLAGS.workout
      ? db.from("workout_history").select("*").eq("status", "done").gte("logical_date", wk).lte("logical_date", weekEnd).order("logical_date")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [name, r] of Object.entries({ settings, weekly, days, targets, runs, lc, redo, apps, reminders, callbacks, workouts }))
    if (r.error) fail(name);

  // Weight and Nutrition can't be archived; the other sections follow the Tabs page.
  const shown = (tab: string) => !settings.data!.archived_tabs.includes(tab);
  const out: string[] = [`# TALOS review packet, ${fmtDay(today)}`];

  if (settings.data?.context_blurb) out.push("", "## Context", settings.data.context_blurb);

  // Weight: the last four Monday weeks, oldest first, from the same view as the Weight tab.
  out.push("", "## Weight (weekly average)", "| Week of | Avg lb | Days |", "|---|---|---|");
  for (const w of [...weeks].reverse()) {
    const r = weekly.data!.find((x) => x.week_start === w);
    out.push(`| ${fmtDay(w)} | ${r?.avg_lb != null ? Number(r.avg_lb).toFixed(1) : "–"} | ${r?.n ?? 0} |`);
  }

  // Nutrition: logged days in the last 7, against today's targets.
  const logged = days.data!;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const cal = avg(logged.map((d) => d.calories ?? 0));
  const p = avg(logged.map((d) => Number(d.protein_g ?? 0)));
  out.push(
    "", "## Nutrition (last 7 days, logged days only)",
    `- Calories: ${cal == null ? "–" : fmtNum(cal)} / ${fmtNum(targets.data!.calorie_target)}`,
    `- Protein: ${p == null ? "–" : Math.round(p)} / ${targets.data!.protein_target_g} g`,
    `- Days logged: ${logged.length} of 7`,
  );

  if (shown("runs")) {
    const runRows = runs.data!;
    const miles = runRows.reduce((a, r) => a + Number(r.distance_mi), 0);
    out.push("", "## Runs this week", `- ${runRows.length} ${runRows.length === 1 ? "run" : "runs"}, ${Math.round(miles * 100) / 100} mi`);
    for (const r of runRows) {
      const m = Number(r.distance_mi);
      out.push(`- ${fmtDay(r.logical_date)} ${m} mi in ${fmtDuration(r.duration_sec)} (${fmtDuration(r.duration_sec / m)}/mi)${r.note ? `: ${r.note}` : ""}`);
    }
  }

  // LeetCode this week, with the owner's notes under each problem.
  if (shown("leetcode")) {
    out.push("", "## LeetCode this week");
    for (const l of lc.data!) {
      const bits = [l.difficulty, l.result, l.minutes != null ? `${Number(l.minutes)} min` : null].filter(Boolean).join(", ");
      out.push(`- ${fmtDay(l.logical_date)} ${l.title}${bits ? ` (${bits})` : ""}${l.notes ? `\n  ${l.notes.replace(/\n/g, "\n  ")}` : ""}`);
    }
    if (!lc.data!.length) out.push("- none");
    out.push(`- Redo queue: ${redo.count ?? 0}`);
  }

  // Applications by status, then what's still to apply to.
  if (shown("applications")) {
    const byStatus: Record<string, number> = {};
    for (const a of apps.data!) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    out.push("", "## Applications", `- Total: ${apps.data!.length}`, ...Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => `- ${s}: ${n}`));
    if (reminders.data!.length) {
      out.push("", "### To apply", ...reminders.data!.map((r) => `- ${r.company}, ${r.position} (noted ${fmtDay(r.noted_date!)})`));
    }
  }

  // The five latest callbacks, debriefs verbatim.
  if (shown("callbacks")) {
    out.push("", "## Callbacks");
    for (const c of callbacks.data!) {
      const head = [c.logical_date ? fmtDay(c.logical_date) : null, c.company, c.kind, c.score, c.outcome].filter(Boolean).join(", ");
      out.push(`### ${head}`, c.debrief || "(no debrief)", "");
    }
    if (!callbacks.data!.length) out.push("- none");
  }

  if (FLAGS.workout) {
    out.push("", "## Workouts this week");
    for (const w of workouts.data as { logical_date: string; plan_name: string | null; sets: number | null; minutes: number | null }[])
      out.push(`- ${fmtDay(w.logical_date)} ${w.plan_name ?? "Workout"}, ${w.sets ?? 0} sets${w.minutes != null ? `, ${w.minutes} min` : ""}`);
    if (!workouts.data!.length) out.push("- none");
  }

  return out.join("\n");
}
