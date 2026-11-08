import { redirect } from "next/navigation";
import { groupTab } from "@/lib/tabGroups";
import { Interviews } from "./Interviews";

/**
 * Each kind of practice keeps its screen here (/tabs/interviews?tab=leetcode, …). The hub
 * itself now lives in Recruiting, so the bare address goes there.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const initial = groupTab("interviews", (await searchParams).tab);
  if (!initial) redirect("/tabs/recruiting?tab=interviews");
  return <Interviews initial={initial} />;
}
