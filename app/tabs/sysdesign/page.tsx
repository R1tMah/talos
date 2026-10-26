import { redirect } from "next/navigation";

// Now the System Design tab of Interviews; old links land there.
export default function Page() {
  redirect("/tabs/interviews?tab=system-design");
}
