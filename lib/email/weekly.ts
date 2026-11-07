// The weekly email: open reminders and a summary of the last 7 days, from the owner's own
// entries. Numbers and the owner's words only, like the review packet: nothing is
// generated, judged or rewritten. Server-side (the scheduled send has no session).
//
//   isDue()     is it the owner's send day, at or after their send hour, and not sent yet that day
//   gather()    reads the items the owner picked
//   render()    turns that into a subject, plain text and HTML (pure)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDays, clockIn, fmtDay, fromISO, logicalDateIn } from "@/lib/date";
import { spend, type Cadence } from "@/lib/subscriptions";
import { dayIn } from "@/lib/watch/calendarDays";
import type { CalendarSnap } from "@/lib/watch/types";

type Admin = SupabaseClient<Database>;

/**
 * Everything the email can hold, one switch each in Settings, in the order they appear.
 * The database accepts exactly these keys (weekly_email.sections check).
 */
export const ITEMS = [
  { key: "reminders", group: "Reminders", label: "Reminders" },
  { key: "longterm", group: "Reminders", label: "Long-term reminders coming up" },
  { key: "to_apply", group: "Reminders", label: "To apply" },
  { key: "weight", group: "Health", label: "Weight" },
  { key: "food", group: "Health", label: "Calories and protein" },
  { key: "runs", group: "Health", label: "Runs" },
  { key: "applications", group: "Career", label: "Applications" },
  { key: "leetcode", group: "Career", label: "LeetCode" },
  { key: "callbacks", group: "Career", label: "Callbacks" },
  { key: "calendar", group: "Coming up", label: "Calendar, next 7 days" },
  { key: "subscriptions", group: "Money", label: "Subscriptions" },
  { key: "spending", group: "Money", label: "Spending" },
] as const;
export type Item = (typeof ITEMS)[number]["key"];
export const GROUPS = [...new Set(ITEMS.map((i) => i.group))];
export const isItem = (v: unknown): v is Item => ITEMS.some((i) => i.key === v);

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Hours it can go out: 4 AM on (before 4 is still the previous day by the app's 4 AM rule). */
export const HOURS = Array.from({ length: 20 }, (_, i) => i + 4);
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

/** How far ahead "Long-term reminders coming up" looks. */
export const LONG_TERM_AHEAD = 30;

export interface Schedule { day: number; hour: number } // day: 0 = Sunday
export const DEFAULT_SCHEDULE: Schedule = { day: 0, hour: 13 };

/** Due on the send day (by the app's 4 AM day) at or after the send hour, and not already sent that day. */
export function isDue(tz: string, lastSentOn: string | null, now = new Date(), at: Schedule = DEFAULT_SCHEDULE): { due: boolean; day: string } {
  const today = logicalDateIn(tz, now);
  const onDay = fromISO(today).getDay() === at.day;
  const sendAt = `${String(at.hour).padStart(2, "0")}:00`;
  return { due: onDay && clockIn(tz, now) >= sendAt && lastSentOn !== today, day: today };
}

// ---- Data ---------------------------------------------------------------------------------

export interface WeeklyData {
  today: string; // the send day
  from: string; // 6 days before: the summary covers from..today
  items: Item[];
  reminders?: { body: string; due: string | null }[];
  longTerm?: { body: string; surface: string; due: string | null }[];
  toApply?: { company: string; position: string; noted: string }[];
  weight?: { avg: number | null; n: number; lastAvg: number | null };
  food?: { days: number; avgCal: number | null; avgProtein: number | null; calTarget: number; proteinTarget: number; proteinDays: number };
  runs?: { count: number; miles: number };
  applications?: { applied: { company: string; position: string }[]; byStatus: Record<string, number> };
  leetcode?: number;
  callbacks?: { company: string; kind: string; date: string | null }[];
  calendar?: { title: string; day: string; time: string | null }[];
  subscriptions?: { monthly: number; active: number };
  spending?: { total: number; count: number; byCategory: { category: string; amount: number }[] };
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`weekly email: couldn't read ${what}`);
  return r.data as NonNullable<T>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const cents = (n: number) => Math.round(n * 100) / 100;

/** Reads what the picked items need. Archived tabs are left out, as elsewhere. */
export async function gather(db: Admin, items: Item[], tz: string, now = new Date()): Promise<WeeklyData> {
  const today = logicalDateIn(tz, now);
  const from = addDays(today, -6);
  const settings = await db.from("settings").select("archived_tabs").eq("id", 1).single();
  if (settings.error) throw new Error("weekly email: couldn't read settings");
  const off = new Set(settings.data.archived_tabs);
  const on = (k: Item) => items.includes(k);
  const out: WeeklyData = { today, from, items };

  if (on("reminders")) {
    out.reminders = must(await db.from("open_reminders").select("body, due_date"), "reminders").map((r) => ({ body: r.body!, due: r.due_date }));
  }
  if (on("longterm")) {
    // Ones not on the banner yet whose day comes within the window.
    out.longTerm = must(
      await db.from("open_long_term_reminders").select("body, surface_date, due_date").eq("surfaced", false).lte("surface_date", addDays(today, LONG_TERM_AHEAD)),
      "long-term reminders",
    ).map((r) => ({ body: r.body!, surface: r.surface_date!, due: r.due_date }));
  }
  if (on("to_apply") && !off.has("applications")) {
    out.toApply = must(await db.from("open_application_reminders").select("company, position, noted_date"), "to-apply list")
      .map((r) => ({ company: r.company!, position: r.position!, noted: r.noted_date! }));
  }

  if (on("weight")) {
    // One weigh-in per day; this window against the 7 days before it.
    const ws = must(
      await db.from("weights").select("logical_date, weight_lb").is("deleted_at", null).gte("logical_date", addDays(from, -7)).lte("logical_date", today),
      "weight",
    );
    const cur = ws.filter((w) => w.logical_date >= from).map((w) => Number(w.weight_lb));
    const last = ws.filter((w) => w.logical_date < from).map((w) => Number(w.weight_lb));
    out.weight = { avg: mean(cur), n: cur.length, lastAvg: mean(last) };
  }
  if (on("food")) {
    const days = must(await db.from("daily_totals").select("*").gte("logical_date", from).lte("logical_date", today), "food")
      .filter((d) => (d.entries ?? 0) > 0);
    const latest = days.at(-1);
    out.food = {
      days: days.length,
      avgCal: mean(days.map((d) => Number(d.calories ?? 0))),
      avgProtein: mean(days.map((d) => Number(d.protein_g ?? 0))),
      calTarget: Number(latest?.calorie_target ?? 0),
      proteinTarget: Number(latest?.protein_target_g ?? 0),
      proteinDays: days.filter((d) => Number(d.protein_g ?? 0) >= Number(d.protein_target_g ?? Infinity)).length,
    };
  }
  if (on("runs") && !off.has("runs")) {
    const runs = must(await db.from("runs").select("distance_mi").is("deleted_at", null).gte("logical_date", from).lte("logical_date", today), "runs");
    out.runs = { count: runs.length, miles: Math.round(runs.reduce((s, r) => s + Number(r.distance_mi ?? 0), 0) * 10) / 10 };
  }

  if (on("applications") && !off.has("applications")) {
    const apps = must(await db.from("applications").select("company, position, status, applied_date").is("deleted_at", null), "applications");
    const byStatus: Record<string, number> = {};
    for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    out.applications = {
      applied: apps.filter((a) => a.applied_date >= from && a.applied_date <= today).map((a) => ({ company: a.company, position: a.position })),
      byStatus,
    };
  }
  if (on("leetcode") && !off.has("leetcode")) {
    out.leetcode = must(await db.from("leetcode_log").select("id").is("deleted_at", null).gte("logical_date", from).lte("logical_date", today), "LeetCode").length;
  }
  if (on("callbacks") && !off.has("callbacks")) {
    out.callbacks = must(
      await db.from("callbacks").select("company, kind, logical_date").is("deleted_at", null).gte("logical_date", from).lte("logical_date", today).order("logical_date"),
      "callbacks",
    ).map((c) => ({ company: c.company, kind: c.kind, date: c.logical_date }));
  }

  if (on("calendar")) {
    // The next 7 days from the Watch calendar's latest snapshot (no extra Google call).
    const cal = must(await db.from("watch_sources").select("data").eq("kind", "calendar").eq("enabled", true), "calendar");
    const events: NonNullable<WeeklyData["calendar"]> = [];
    for (const c of cal) {
      const snap = c.data as unknown as CalendarSnap | null;
      for (const e of snap?.events ?? []) {
        const day = e.allDay ? e.start : dayIn(snap!.timezone, new Date(e.start));
        if (day <= today || day > addDays(today, 7)) continue;
        const time = e.allDay ? null : new Date(e.start).toLocaleTimeString("en-US", { timeZone: snap!.timezone, hour: "numeric", minute: "2-digit" });
        events.push({ title: e.title, day, time });
      }
    }
    out.calendar = events.sort((a, b) => a.day.localeCompare(b.day));
  }
  if (on("subscriptions")) {
    const subs = must(await db.from("subscriptions").select("amount, cadence, cancelled_on").is("deleted_at", null), "subscriptions");
    const s = spend(subs.map((x, i) => ({
      id: String(i), name: "", amount: Number(x.amount), cadence: x.cadence as Cadence, startedOn: "", cancelledOn: x.cancelled_on, note: null,
    })));
    out.subscriptions = { monthly: s.monthly, active: s.active };
  }
  if (on("spending")) {
    const rows = must(await db.from("spending").select("amount, category").is("deleted_at", null).gte("logical_date", from).lte("logical_date", today), "spending");
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.category, (by.get(r.category) ?? 0) + Number(r.amount));
    out.spending = {
      total: cents(rows.reduce((s, r) => s + Number(r.amount), 0)),
      count: rows.length,
      byCategory: [...by].map(([category, amount]) => ({ category, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
    };
  }
  return out;
}

// ---- Render -------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const usd = (n: number) => `$${n.toFixed(2)}`;

interface Block { title: string; lines: string[] } // lines are plain text
interface Part { heading: string; groups: Block[] }

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

/**
 * The email's sections. `hideEmpty` leaves out lines that only say nothing happened
 * ("no weigh-ins", "nothing on the calendar"), and a section with nothing left.
 */
function parts(d: WeeklyData, hideEmpty: boolean): Part[] {
  const out: Part[] = [];
  const empty = (line: string) => (hideEmpty ? [] : [line]);
  const push = (heading: string, groups: Block[]) => {
    const kept = groups.filter((g) => g.lines.length || (g.title && !hideEmpty));
    if (kept.length) out.push({ heading, groups: kept });
  };

  if (d.reminders || d.longTerm || d.toApply) {
    const groups = d.reminders ? reminderGroups(d.reminders, d.today) : [];
    if (d.longTerm?.length) {
      groups.push({
        title: `Long-term, showing up in the next ${LONG_TERM_AHEAD} days`,
        lines: d.longTerm.map((r) => `${r.body} (shows ${fmtDay(r.surface)}${r.due ? `, due ${fmtDay(r.due)}` : ""})`),
      });
    }
    if (d.toApply?.length) groups.push({ title: "To apply", lines: d.toApply.map((a) => `${a.company}, ${a.position}`) });
    push("Reminders", groups.length ? groups : [{ title: "", lines: empty("Nothing open. 🎉") }]);
  }

  if (d.weight || d.food || d.runs) {
    const lines: string[] = [];
    if (d.weight) {
      if (d.weight.avg == null) lines.push(...empty("Weight: no weigh-ins this week."));
      else {
        const diff = d.weight.lastAvg == null ? "" : ` (${d.weight.avg - d.weight.lastAvg >= 0 ? "+" : ""}${n1(d.weight.avg - d.weight.lastAvg)} vs last week's ${n1(d.weight.lastAvg)})`;
        lines.push(`Weight: ${n1(d.weight.avg)} lb average over ${d.weight.n} ${d.weight.n === 1 ? "day" : "days"}${diff}`);
      }
    }
    if (d.food) {
      if (!d.food.days) lines.push(...empty("Food: nothing logged this week."));
      else {
        lines.push(`Calories: ${n0(d.food.avgCal!)} a day on average (target ${n0(d.food.calTarget)}), ${d.food.days} ${d.food.days === 1 ? "day" : "days"} logged`);
        lines.push(`Protein: ${n0(d.food.avgProtein!)} g a day on average (target ${n0(d.food.proteinTarget)} g), hit on ${d.food.proteinDays} of ${d.food.days}`);
      }
    }
    if (d.runs) lines.push(...(d.runs.count ? [`Runs: ${d.runs.count} for ${d.runs.miles} mi`] : empty("Runs: none this week")));
    push("Health", [{ title: "", lines }]);
  }

  if (d.applications || d.leetcode != null || d.callbacks) {
    const groups: Block[] = [];
    if (d.applications) {
      const a = d.applications;
      if (a.applied.length || !hideEmpty) groups.push({ title: `Applied this week: ${a.applied.length}`, lines: a.applied.map((x) => `${x.company}, ${x.position}`) });
      const statuses = Object.entries(a.byStatus).sort((x, y) => y[1] - x[1]);
      if (statuses.length) groups.push({ title: "All applications", lines: [statuses.map(([s, k]) => `${s} ${k}`).join(" · ")] });
    }
    if (d.leetcode != null) groups.push({ title: "", lines: d.leetcode ? [`LeetCode: ${d.leetcode} this week`] : empty("LeetCode: 0 this week") });
    if (d.callbacks?.length) groups.push({ title: "Callbacks", lines: d.callbacks.map((x) => `${x.company}: ${x.kind}${x.date ? ` (${fmtDay(x.date)})` : ""}`) });
    push("Career", groups);
  }

  if (d.calendar) {
    push("Coming up", [{
      title: "Next 7 days",
      lines: d.calendar.length ? d.calendar.map((e) => `${fmtDay(e.day)}${e.time ? ` ${e.time}` : ""}: ${e.title}`) : empty("Nothing on the calendar."),
    }]);
  }

  if (d.subscriptions || d.spending) {
    const groups: Block[] = [];
    if (d.spending) {
      const s = d.spending;
      if (s.count) groups.push({ title: `Spent this week: ${usd(s.total)} across ${s.count}`, lines: s.byCategory.map((c) => `${c.category}: ${usd(c.amount)}`) });
      else groups.push({ title: "", lines: empty("Spending: nothing logged this week.") });
    }
    if (d.subscriptions) {
      const s = d.subscriptions;
      groups.push({ title: "", lines: s.active ? [`Subscriptions: ${usd(s.monthly)} a month across ${s.active}`] : empty("Subscriptions: none active") });
    }
    push("Money", groups);
  }
  return out;
}

export function render(d: WeeklyData, appUrl: string | null, opts: { hideEmpty?: boolean } = {}): { subject: string; text: string; html: string } {
  const open = d.reminders?.length ?? 0;
  const overdue = d.reminders?.filter((r) => r.due != null && r.due < d.today).length ?? 0;
  const subject = `TALOS week of ${fmtDay(d.from)}${d.reminders ? ` · ${open} ${open === 1 ? "reminder" : "reminders"}${overdue ? ` (${overdue} overdue)` : ""}` : ""}`;
  const ps = parts(d, opts.hideEmpty ?? false);
  const nothing = ps.length === 0 ? ["", "Nothing to report this week."] : [];

  const text = [
    `Your week, ${fmtDay(d.from)} to ${fmtDay(d.today)}`,
    ...ps.flatMap((p) => ["", p.heading.toUpperCase(), ...p.groups.flatMap((g) => [...(g.title ? [`${g.title}:`] : []), ...g.lines.map((l) => `  - ${l}`)])]),
    ...nothing,
    "",
    appUrl ? `Open TALOS: ${appUrl}` : "",
    "Change what's in this email in TALOS > Settings > Weekly email.",
  ].join("\n");

  const h = (tag: string, style: string, body: string) => `<${tag} style="${style}">${body}</${tag}>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0e1116">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
${h("div", "font-size:22px;font-weight:700;color:#c2477f;letter-spacing:.04em", "TALOS")}
${h("p", "margin:4px 0 20px;color:#59616c;font-size:14px", `Your week, ${esc(fmtDay(d.from))} to ${esc(fmtDay(d.today))}`)}
${ps.map((p) => `<div style="background:#fff;border:1px solid #e1e5ea;border-radius:12px;padding:16px;margin-bottom:12px">
${h("div", "font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#59616c;margin-bottom:8px", esc(p.heading))}
${p.groups.map((g) => `${g.title ? h("div", "font-weight:600;font-size:14px;margin:8px 0 4px", esc(g.title)) : ""}${g.lines.length ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${g.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}`).join("")}
</div>`).join("\n")}
${nothing.length ? h("p", "font-size:14px;color:#59616c", "Nothing to report this week.") : ""}
${h("p", "font-size:12px;color:#59616c;margin-top:16px", `${appUrl ? `<a href="${esc(appUrl)}" style="color:#c2477f">Open TALOS</a> · ` : ""}Change what&rsquo;s in this email in Settings &rsaquo; Weekly email.`)}
</div></body></html>`;
  return { subject, text, html };
}
