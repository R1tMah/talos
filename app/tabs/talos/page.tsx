import { redirect } from "next/navigation";

// Talos Improvements moved to Settings; old links land there.
export default function Page() {
  redirect("/settings/talos");
}
