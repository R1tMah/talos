// The tabs that can be archived, named once. Weight and Nutrition are always on.
// The database accepts exactly these keys (settings.archived_tabs check).
export const ARCHIVABLE = [
  { key: "leetcode", label: "LeetCode", href: "/tabs/interviews?tab=leetcode" },
  { key: "runs", label: "Runs", href: "/tabs/runs" },
  // These two live on the Recruiting page (lib/tabGroups.ts), one tab each.
  { key: "applications", label: "Applications", href: "/tabs/recruiting?tab=applications" },
  { key: "callbacks", label: "Callbacks", href: "/tabs/recruiting?tab=callbacks" },
  // These three live on the Journals page (lib/journals.ts), one tab each.
  { key: "content", label: "Content", href: "/tabs/journals?tab=content" },
  { key: "journal", label: "Work Journal", href: "/tabs/journals?tab=work" },
  { key: "personal", label: "Personal Journal", href: "/tabs/journals?tab=personal" },
  { key: "talos", label: "Talos Improvements", href: "/settings/talos" }, // lives in Settings, not on Tabs
  { key: "sysdesign", label: "System Design Mocks", href: "/tabs/interviews?tab=system-design" },
  { key: "aiassisted", label: "AI-Assisted Mocks", href: "/tabs/interviews?tab=ai-assisted" },
  { key: "longterm", label: "Long Term", href: "/tabs/long-term" }, // under "Once in a while" on Tabs
  { key: "learning", label: "Learning", href: "/tabs/learning" },
  { key: "behavioral", label: "Behavioral Mocks", href: "/tabs/interviews?tab=behavioral" },
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
  // System Design and AI-Assisted Mocks stay out of chat: their entries are long summaries pasted into the tab.
  // Long Term stays out too: no chat tool writes seasons yet. Learning too: curriculums start from its form for now.
  ...ARCHIVABLE.filter((t) => t.key !== "sysdesign" && t.key !== "aiassisted" && t.key !== "longterm" && t.key !== "learning" && t.key !== "behavioral").map(({ key, label }) => ({ key, label })),
  { key: "subscriptions", label: "Subscriptions" },
  { key: "spending", label: "Spending" },
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
  subscriptions: ["subscription", "subs"],
  spending: ["spend", "spent", "money", "purchase", "purchases", "finances"],
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

/**
 * "Once in a while": tabs opened occasionally rather than daily (a set that started with
 * Portfolio). They sit in their own section at the bottom of the TALOS page.
 */
export const ONCE_IN_A_WHILE = [
  { key: "portfolio", label: "Portfolio", href: "/tabs/portfolio", sub: "Projects · Timeline · Experience" },
] as const;
