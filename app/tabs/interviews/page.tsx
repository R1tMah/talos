import { groupTab } from "@/lib/tabGroups";
import { Interviews } from "./Interviews";

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <Interviews initial={groupTab("interviews", (await searchParams).tab)} />;
}
