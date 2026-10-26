// The Sunday email: open reminders and a summary of the week, from the owner's own
// entries. Numbers and the owner's words only, like the review packet: nothing is
// generated, judged or rewritten. Server-side (the scheduled send has no session).
//
//   isDue()     is it Sunday 1 PM or later where the owner is, and not sent yet today
//   gather()    reads the sections the owner picked
//   render()    turns that into a subject, plain text and HTML (pure)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDays, clockIn, fmtDay, fromISO, logicalDateIn, weekStart } from "@/lib/date";
import { spend, type Cadence } from "@/lib/subscriptions";
import { dayIn } from "@/lib/watch/calendarDays";
import type { CalendarSnap } from "@/lib/watch/types";

type Admin = SupabaseClient<Database>;

export const SECTIONS = [
  { key: "reminders", label: "Reminders + To apply" },
  { key: "health", label: "Health: weight, food, runs" },
  { key: "career", label: "Career: applications, LeetCode, callbacks" },
  { key: "ahead", label: "Next week + money: calendar, subscriptions" },
] as const;
export type Section = (typeof SECTIONS)[number]["key"];

export const SEND_AT = "13:00"; // Sunday, owner's time

/** Due when it's Sunday (by the app's 4 AM day) at or after 1 PM, and not already sent that Sunday. */
export function isDue(tz: string, lastSentOn: string | null, now = new Date()): { due: boolean; sunday: string } {
  const today = logicalDateIn(tz, now);
  const sunday = fromISO(today).getDay() === 0;
  return { due: sunday && clockIn(tz, now) >= SEND_AT && lastSentOn !== today, sunday: today };
}

// ---- Data ---------------------------------------------------------------------------------

export interface WeeklyData {
  today: string; // the Sunday it's for
  weekStart: string; // the Monday
  sections: Section[];
  reminders?: { body: string; due: string | null }[];
  toApply?: { company: string; position: string; noted: string }[];
  weight?: { avg: number | null; n: number; lastAvg: number | null };
  food?: { days: number; avgCal: number | null; avgProtein: number | null; calTarget: number; proteinTarget: number; proteinDays: number };
  runs?: { count: number; miles: number };
  career?: { applied: { company: string; position: string }[]; byStatus: Record<string, number>; leetcode: number; callbacks: { company: string; kind: string; date: string | null }[] };
  ahead?: { events: { title: string; day: string; time: string | null }[]; subsMonthly: number; subsActive: number };
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`weekly email: couldn't read ${what}`);
  return r.data as NonNullable<T>;
}

/** Reads what the picked sections need. Archived tabs are left out, as elsewhere. */
export async function gather(db: Admin, sections: Section[], tz: string, now = new Date()): Promise<WeeklyData> {
  const today = logicalDateIn(tz, now);
  const wk = weekStart(today);
  const settings = await db.from("settings").select("archived_tabs").eq("id", 1).single();
  if (settings.error) throw new Error("weekly email: couldn't read settings");
  const off = new Set(settings.data.archived_tabs);
  const out: WeeklyData = { today, weekStart: wk, sections };

  if (sections.includes("reminders")) {
    out.reminders = must(await db.from("open_reminders").select("body, due_date"), "reminders").map((r) => ({ body: r.body!, due: r.due_date }));
    if (!off.has("applications")) {
      out.toApply = must(await db.from("open_application_reminders").select("company, position, noted_date"), "to-apply list")
        .map((r) => ({ company: r.company!, position: r.position!, noted: r.noted_date! }));
    }
  }

  if (sections.includes("health")) {
    const weeks = must(await db.from("weekly_weights").select("week_start, avg_lb, n").in("week_start", [wk, addDays(wk, -7)]), "weight");
    const cur = weeks.find((w) => w.week_start === wk), last = weeks.find((w) => w.week_start === addDays(wk, -7));
    out.weight = { avg: cur?.avg_lb ?? null, n: cur?.n ?? 0, lastAvg: last?.avg_lb ?? null };

    const days = must(await db.from("daily_totals").select("*").gte("logical_date", wk).lte("logical_date", today), "food")
      .filter((d) => (d.entries ?? 0) > 0);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const latest = days.at(-1);
    out.food = {
      days: days.length,
      avgCal: mean(days.map((d) => Number(d.calories ?? 0))),
      avgProtein: mean(days.map((d) => Number(d.protein_g ?? 0))),
      calTarget: Number(latest?.calorie_target ?? 0),
      proteinTarget: Number(latest?.protein_target_g ?? 0),
      proteinDays: days.filter((d) => Number(d.protein_g ?? 0) >= Number(d.protein_target_g ?? Infinity)).length,
    };

    if (!off.has("runs")) {
      const runs = must(await db.from("runs").select("distance_mi").is("deleted_at", null).gte("logical_date", wk).lte("logical_date", today), "runs");
      out.runs = { count: runs.length, miles: Math.round(runs.reduce((s, r) => s + Number(r.distance_mi ?? 0), 0) * 10) / 10 };
    }
  }

  if (sections.includes("career")) {
    const apps = off.has("applications") ? [] : must(await db.from("applications").select("company, position, status, applied_date").is("deleted_at", null), "applications");
    const byStatus: Record<string, number> = {};
    for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const lc = off.has("leetcode") ? [] : must(await db.from("leetcode_log").select("id").is("deleted_at", null).gte("logical_date", wk).lte("logical_date", today), "LeetCode");
    const cbs = off.has("callbacks") ? [] : must(
      await db.from("callbacks").select("company, kind, logical_date").is("deleted_at", null).gte("logical_date", wk).lte("logical_date", today).order("logical_date"),
      "callbacks",
    );
    out.career = {
      applied: apps.filter((a) => a.applied_date >= wk && a.applied_date <= today).map((a) => ({ company: a.company, position: a.position })),
      byStatus, leetcode: lc.length,
      callbacks: cbs.map((c) => ({ company: c.company, kind: c.kind, date: c.logical_date })),
    };
  }

  if (sections.includes("ahead")) {
    // Next week's events from the Watch calendar's latest snapshot (no extra Google call).
    const cal = must(await db.from("watch_sources").select("data").eq("kind", "calendar").eq("enabled", true), "calendar");
    const events: NonNullable<WeeklyData["ahead"]>["events"] = [];
    for (const c of cal) {
      const snap = c.data as unknown as CalendarSnap | null;
      for (const e of snap?.events ?? []) {
        const day = e.allDay ? e.start : dayIn(snap!.timezone, new Date(e.start));
        if (day <= today || day > addDays(today, 7)) continue;
        const time = e.allDay ? null : new Date(e.start).toLocaleTimeString("en-US", { timeZone: snap!.timezone, hour: "numeric", minute: "2-digit" });
        events.push({ title: e.title, day, time });
      }
    }
    const subs = must(await db.from("subscriptions").select("amount, cadence, cancelled_on").is("deleted_at", null), "subscriptions");
    const s = spend(subs.map((x, i) => ({
      id: String(i), name: "", amount: Number(x.amount), cadence: x.cadence as Cadence, startedOn: "", cancelledOn: x.cancelled_on, note: null,
    })));
    out.ahead = { events, subsMonthly: s.monthly, subsActive: s.active };
  }
  return out;
}

// ---- Render -------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

interface Block { title: string; lines: string[] } // lines are plain text

/** Overdue first, then due this week, later, then undated: how a reminder list is read. */
function reminderGroups(rs: NonNullable<WeeklyData["reminders"]>, today: string): Block[] {
  const soon = addDays(today, 7);
  const by = (pred: (r: { due: string | null }) => boolean) => rs.filter(pred).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const line = (r: { body: string; due: string | null }) => (r.due ? `${r.body} (${fmtDay(r.due)})` : r.body);
  return [
    { title: "Overdue", lines: by((r) => r.due != null && r.due < today).map(line) },
    { title: "Due this week", lines: by((r) => r.due != null && r.due >= today && r.due <= soon).map(line) },
    { title: "Later", lines: by((r) => r.due != null && r.due > soon).map(line) },
    { title: "No date", lines: rs.filter((r) => r.due == null).map(line) },
  ].filter((g) => g.lines.length);
}

function blocks(d: WeeklyData): { heading: string; groups: Block[] }[] {
  const out: { heading: string; groups: Block[] }[] = [];
  if (d.reminders) {
    const groups = reminderGroups(d.reminders, d.today);
    if (d.toApply?.length) groups.push({ title: "To apply", lines: d.toApply.map((a) => `${a.company}, ${a.position}`) });
    out.push({ heading: "Reminders", groups: groups.length ? groups : [{ title: "", lines: ["Nothing open. 🎉"] }] });
  }
  if (d.weight || d.food || d.runs) {
    const lines: string[] = [];
    if (d.weight) {
      if (d.weight.avg == null) lines.push("Weight: no weigh-ins this week.");
      else {
        const diff = d.weight.lastAvg == null ? "" : ` (${d.weight.avg - d.weight.lastAvg >= 0 ? "+" : ""}${n1(d.weight.avg - d.weight.lastAvg)} vs last week's ${n1(d.weight.lastAvg)})`;
        lines.push(`Weight: ${n1(d.weight.avg)} lb average over ${d.weight.n} ${d.weight.n === 1 ? "day" : "days"}${diff}`);
      }
    }
    if (d.food) {
      if (!d.food.days) lines.push("Food: nothing logged this week.");
      else {
        lines.push(`Calories: ${n0(d.food.avgCal!)} a day on average (target ${n0(d.food.calTarget)}), ${d.food.days} ${d.food.days === 1 ? "day" : "days"} logged`);
        lines.push(`Protein: ${n0(d.food.avgProtein!)} g a day on average (target ${n0(d.food.proteinTarget)} g), hit on ${d.food.proteinDays} of ${d.food.days}`);
      }
    }
    if (d.runs) lines.push(d.runs.count ? `Runs: ${d.runs.count} for ${d.runs.miles} mi` : "Runs: none this week");
    out.push({ heading: "Health", groups: [{ title: "", lines }] });
  }
  if (d.career) {
    const c = d.career;
    const groups: Block[] = [];
    groups.push({
      title: `Applied this week: ${c.applied.length}`,
      lines: c.applied.map((a) => `${a.company}, ${a.position}`),
    });
    const statuses = Object.entries(c.byStatus).sort((a, b) => b[1] - a[1]);
    if (statuses.length) groups.push({ title: "All applications", lines: [statuses.map(([s, k]) => `${s} ${k}`).join(" · ")] });
    groups.push({ title: "", lines: [`LeetCode: ${c.leetcode} this week`] });
    if (c.callbacks.length) groups.push({ title: "Callbacks", lines: c.callbacks.map((x) => `${x.company}: ${x.kind}${x.date ? ` (${fmtDay(x.date)})` : ""}`) });
    out.push({ heading: "Career", groups });
  }
  if (d.ahead) {
    const a = d.ahead;
    const groups: Block[] = [{
      title: "Next 7 days",
      lines: a.events.length ? a.events.map((e) => `${fmtDay(e.day)}${e.time ? ` ${e.time}` : ""}: ${e.title}`) : ["Nothing on the calendar."],
    }];
    groups.push({ title: "", lines: [`Subscriptions: $${a.subsMonthly.toFixed(2)} a month across ${a.subsActive}`] });
    out.push({ heading: "Coming up", groups });
  }
  return out;
}

export function render(d: WeeklyData, appUrl: string | null): { subject: string; text: string; html: string } {
  const open = d.reminders?.length ?? 0;
  const overdue = d.reminders?.filter((r) => r.due != null && r.due < d.today).length ?? 0;
  const subject = `TALOS week of ${fmtDay(d.weekStart)}${d.reminders ? ` · ${open} ${open === 1 ? "reminder" : "reminders"}${overdue ? ` (${overdue} overdue)` : ""}` : ""}`;
  const parts = blocks(d);

  const text = [
    `Your week, ${fmtDay(d.weekStart)} to ${fmtDay(d.today)}`,
    ...parts.flatMap((p) => ["", p.heading.toUpperCase(), ...p.groups.flatMap((g) => [...(g.title ? [`${g.title}:`] : []), ...g.lines.map((l) => `  - ${l}`)])]),
    "",
    appUrl ? `Open TALOS: ${appUrl}` : "",
    "Change what's in this email in TALOS > Settings > Weekly email.",
  ].join("\n");

  const h = (tag: string, style: string, body: string) => `<${tag} style="${style}">${body}</${tag}>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0e1116">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
${h("div", "font-size:22px;font-weight:700;color:#c2477f;letter-spacing:.04em", "TALOS")}
${h("p", "margin:4px 0 20px;color:#59616c;font-size:14px", `Your week, ${esc(fmtDay(d.weekStart))} to ${esc(fmtDay(d.today))}`)}
${parts.map((p) => `<div style="background:#fff;border:1px solid #e1e5ea;border-radius:12px;padding:16px;margin-bottom:12px">
${h("div", "font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#59616c;margin-bottom:8px", esc(p.heading))}
${p.groups.map((g) => `${g.title ? h("div", "font-weight:600;font-size:14px;margin:8px 0 4px", esc(g.title)) : ""}${g.lines.length ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${g.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}`).join("")}
</div>`).join("\n")}
${h("p", "font-size:12px;color:#59616c;margin-top:16px", `${appUrl ? `<a href="${esc(appUrl)}" style="color:#c2477f">Open TALOS</a> · ` : ""}Change what&rsquo;s in this email in Settings &rsaquo; Weekly email.`)}
</div></body></html>`;
  return { subject, text, html };
}
