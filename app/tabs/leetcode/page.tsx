import { redirect } from "next/navigation";

// Now a tab of Interviews; old links land there, keeping any query.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && k !== "tab") q.set(k, v);
  q.set("tab", "leetcode");
  redirect(`/tabs/interviews?${q}`);
}
