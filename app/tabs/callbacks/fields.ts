import type { Field } from "@/components/FormSheet";
import { CALLBACK_KINDS, type CallbackInput } from "@/lib/callbacksData";

export const CALLBACK_FIELDS: Field[] = [
  { name: "company", label: "Company", full: true },
  { name: "kind", label: "Type", type: "select", options: CALLBACK_KINDS },
  { name: "date", label: "Date", type: "date" },
  { name: "score", label: "Score", placeholder: "e.g. 508/600" },
  { name: "outcome", label: "Outcome", placeholder: "e.g. Rejected, Advanced" },
];

export function validateCallback(v: Record<string, unknown>) {
  if (!String(v.company ?? "").trim()) return "Company is required.";
  if (!v.kind) return "Type is required.";
  return null;
}

/** Empty fields stay empty (null), never defaulted. */
export const callbackOf = (v: Record<string, unknown>): CallbackInput => ({
  date: (v.date as string) || null,
  company: String(v.company).trim(),
  kind: v.kind as string,
  score: String(v.score ?? "").trim() || null,
  outcome: String(v.outcome ?? "").trim() || null,
});
