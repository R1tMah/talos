import Link from "next/link";
import { IconChevron } from "@/components/Icons";
import { ScreenHeader } from "@/components/ui";

const TABS = [
  ["Home", "/tabs/home"],
  ["Weight", "/tabs/weight"],
  ["Nutrition", "/tabs/nutrition"],
  ["LeetCode", "/tabs/leetcode"],
  ["Applications", "/tabs/applications"],
  ["Callbacks", "/tabs/callbacks"],
  ["Content", "/tabs/content"],
  ["Work Journal", "/tabs/journal"],
];

export default function TabsPage() {
  return (
    <main className="screen">
      <ScreenHeader title="Tabs" />
      <nav className="card list">
        {TABS.map(([label, href]) => (
          <Link key={href} href={href} className="row">
            <span className="row-label">{label}</span>
            <IconChevron />
          </Link>
        ))}
      </nav>
      <nav className="card list">
        <Link href="/tabs/notes" className="row">
          <span className="row-label muted">Unsorted notes</span>
          <IconChevron />
        </Link>
      </nav>
    </main>
  );
}
