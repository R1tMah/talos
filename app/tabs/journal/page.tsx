import { redirect } from "next/navigation";

// Now a tab of Journals; old links land there.
export default function Page() {
  redirect("/tabs/journals?tab=work");
}
