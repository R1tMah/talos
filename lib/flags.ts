// Feature flags. Each reads a NEXT_PUBLIC_ variable, inlined at build time, so
// flipping one on Vercel needs a redeploy. The second argument is what ships when
// the variable is unset. Values: on / off (also true / false, 1 / 0).
const flag = (v: string | undefined, fallback: boolean) =>
  v == null || v.trim() === "" ? fallback : ["on", "true", "1"].includes(v.trim().toLowerCase());

export const FLAGS = {
  /** Workout tab, Lifts progress page, Lifts card on Tabs, workout settings. Off for now. */
  workout: flag(process.env.NEXT_PUBLIC_FLAG_WORKOUT, false),
  /** Finances tab. On everywhere unless set to off; to be removed once it's settled. */
  finances: flag(process.env.NEXT_PUBLIC_FLAG_FINANCES, true),
};
