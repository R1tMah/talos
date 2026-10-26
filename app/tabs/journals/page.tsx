import { groupTab } from "@/lib/tabGroups";
import { Journals } from "./Journals";

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <Journals initial={groupTab("journals", (await searchParams).tab)} />;
}
