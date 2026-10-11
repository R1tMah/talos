import type { Field } from "@/components/FormSheet";

export const CALLBACK_FIELDS: Field[] = [
  { name: "company", label: "Company" },
  { name: "type", label: "Type", type: "select", options: ["Interview", "OA", "Recruiter"] },
  { name: "stage", label: "Stage" },
  { name: "date", label: "Date", type: "date" },
  { name: "time", label: "Time", type: "time" },
];
