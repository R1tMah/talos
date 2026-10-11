import { redirect } from "next/navigation";

/** Home's stat cards now live on the Tabs page. */
export default function OldHomeRoute() {
  redirect("/tabs");
}
