import { redirect } from "next/navigation";

/** Long Term moved onto the Journals page. */
export default function Page() {
  redirect("/tabs/journals?tab=long-term");
}
