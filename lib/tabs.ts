// The tabs that can be archived, named once. Weight and Nutrition are always on.
// The database accepts exactly these keys (settings.archived_tabs check).
export const ARCHIVABLE = [
  { key: "leetcode", label: "LeetCode", href: "/tabs/leetcode" },
  { key: "runs", label: "Runs", href: "/tabs/runs" },
  { key: "applications", label: "Applications", href: "/tabs/applications" },
  { key: "callbacks", label: "Callbacks", href: "/tabs/callbacks" },
  { key: "content", label: "Content", href: "/tabs/content" },
  { key: "journal", label: "Work Journal", href: "/tabs/journal" },
  { key: "personal", label: "Personal Journal", href: "/tabs/personal" },
  { key: "talos", label: "Talos Improvements", href: "/tabs/talos" },
] as const;

export type TabKey = (typeof ARCHIVABLE)[number]["key"];

export const tabLabel = (key: TabKey) => ARCHIVABLE.find((t) => t.key === key)!.label;

/** Every tab chat can log to, in Chat's chip order. Weight and Nutrition can't be archived. */
export const CHAT_TABS = [
  { key: "weight", label: "Weight" },
  { key: "nutrition", label: "Nutrition" },
  ...ARCHIVABLE.map(({ key, label }) => ({ key, label })),
] as const;

export type ChatTab = (typeof CHAT_TABS)[number]["key"];

export const isChatTab = (v: unknown): v is ChatTab => typeof v === "string" && CHAT_TABS.some((t) => t.key === v);
