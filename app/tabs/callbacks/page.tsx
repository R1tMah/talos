import { redirect } from "next/navigation";

// Now a tab of Recruiting; old links land there.
export default function Page() {
  redirect("/tabs/recruiting?tab=callbacks");
}
