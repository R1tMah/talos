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

/**
 * Every tab chat can log to, in Chat's chip order. Weight, Nutrition and Subscriptions can't be
 * archived. Subscriptions (in Finances) is the one part of Finances chat can reach.
 */
export const CHAT_TABS = [
  { key: "weight", label: "Weight" },
  { key: "nutrition", label: "Nutrition" },
  ...ARCHIVABLE.map(({ key, label }) => ({ key, label })),
  { key: "subscriptions", label: "Subscriptions" },
] as const;

export type ChatTab = (typeof CHAT_TABS)[number]["key"];

export const isChatTab = (v: unknown): v is ChatTab => typeof v === "string" && CHAT_TABS.some((t) => t.key === v);

// Other words for each tab, for a typed answer to "Where does this go?".
const ALIASES: Record<ChatTab, string[]> = {
  weight: ["weigh in", "weigh-in"],
  nutrition: ["food", "meal", "meals", "calories", "protein"],
  leetcode: ["lc", "leet code"],
  runs: ["run", "running"],
  applications: ["application", "apps", "applied"],
  callbacks: ["callback", "interview", "oa"],
  content: ["content idea", "content ideas"],
  journal: ["work", "work journal", "journal"],
  personal: ["personal", "personal journal", "diary"],
  talos: ["talos", "talos improvement", "talos idea"],
  subscriptions: ["subscription", "subs", "finances"],
};

/**
 * The tab a whole reply names ("weight", "it goes in food", "Work Journal."), or null.
 * Only the entire message counts, so "168 weight" is still an ordinary message.
 */
export function tabFromReply(text: string): ChatTab | null {
  const said = text
    .toLowerCase()
    .replace(/[.!?,"']/g, " ")
    .replace(/^\s*(?:(?:it\s+)?(?:goes|go|put it|log it|save it)\s+)?(?:(?:in|into|to|under)\s+)?(?:the\s+)?/, "")
    .replace(/\s+tab\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const t of CHAT_TABS) {
    if (said === t.key || said === t.label.toLowerCase() || ALIASES[t.key].includes(said)) return t.key;
  }
  return null;
}
