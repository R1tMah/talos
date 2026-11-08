// A tab chip in Chat narrows a message to one tab: only that tab's tools are offered
// to the model (and to "Where does this go?"). Tools are listed here per tab, once.
import type { ChatTab } from "@/lib/tabs";

export const TAB_TOOLS: Record<ChatTab, readonly string[]> = {
  weight: ["log_weight"],
  nutrition: ["log_food", "log_saved_meal", "save_meal", "save_food"],
  leetcode: ["log_leetcode"],
  runs: ["log_run"],
  applications: ["add_application", "plan_application", "update_application"],
  callbacks: ["log_callback"],
  content: ["add_note"],
  journal: ["add_note"],
  personal: ["add_note"],
  talos: ["add_note"],
  subscriptions: ["add_subscription", "cancel_subscription"],
  spending: ["log_spending"],
  experiences: ["add_experience", "complete_experience"],
};

/** True when the tool may run for this message (always, when no chip was picked). */
export const inScope = (tab: ChatTab | undefined, tool: string) => !tab || TAB_TOOLS[tab].includes(tool);
