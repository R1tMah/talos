import { redirect } from "next/navigation";

// Lifts lives in Weight (Weight | Lifts); old links land there.
export default function Page() {
  redirect("/tabs/weight?tab=lifts");
}
