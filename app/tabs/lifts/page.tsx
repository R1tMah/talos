import { redirect } from "next/navigation";

// Lifts now lives in Nutrition (Nutrition | Lifts); old links land there.
export default function Page() {
  redirect("/tabs/nutrition?tab=lifts");
}
