import { groupTab } from "@/lib/tabGroups";
import { Recruiting } from "./Recruiting";

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <Recruiting initial={groupTab("recruiting", (await searchParams).tab)} />;
}
