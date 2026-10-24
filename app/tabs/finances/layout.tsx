import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FLAGS } from "@/lib/flags";

/** Finances is behind FLAGS.finances; while it's off it sends you to Tabs. */
export default function FinancesFlag({ children }: { children: ReactNode }) {
  if (!FLAGS.finances) redirect("/tabs");
  return children;
}
