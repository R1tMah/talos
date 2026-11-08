import { groupTab } from "@/lib/tabGroups";
import { INTERVIEWS_TAB, Recruiting } from "./Recruiting";

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { tab } = await searchParams;
  return <Recruiting initial={groupTab("recruiting", tab)} interviews={tab === INTERVIEWS_TAB} />;
}
