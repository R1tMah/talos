// The chat transcript outlives the Chat page: a reply that lands after you switch tabs
// is still added and saved, and one cut off by closing the app is fetched again.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Msg } from "@/lib/chatStore";

const storage = new Map<string, string>();
beforeAll(() => {
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    window: new EventTarget(),
  });
});

const saved = () => JSON.parse(storage.get("talos.chat.v3")!) as { day: string; msgs: Msg[] };
// A fresh copy of the module, as when the app starts.
const fresh = async () => {
  vi.resetModules();
  return import("@/lib/chatStore");
};

describe("chatStore", () => {
  beforeEach(() => {
    storage.clear();
    vi.useRealTimers();
  });

  it("keeps a reply that arrives while the page is closed, right under its message", async () => {
    const { chatStore } = await fresh();
    chatStore.open("2099-10-01");
    chatStore.setMsgs((xs) => [...xs, { id: "u1", role: "user", text: "168.2", ts: 1, pending: true }]);
    // The page unmounts here; the reply comes back later.
    chatStore.resolve("u1", [{ id: "r1", role: "app", card: { kind: "saved", label: "Weight 168.2 lb", actionId: "a1" }, ts: 2 }]);
    chatStore.open("2099-10-01"); // coming back on the same day keeps what's in memory
    expect(saved().msgs).toMatchObject([{ id: "u1", pending: false }, { id: "r1" }]);
  });

  it("a new day starts empty", async () => {
    const { chatStore } = await fresh();
    chatStore.open("2099-10-02");
    expect(saved()).toEqual({ day: "2099-10-02", msgs: [] });
  });

  it("after a reload, fetches the reply a pending message never got", async () => {
    storage.set("talos.chat.v3", JSON.stringify({ day: "2099-10-03", msgs: [{ id: "u2", role: "user", text: "ran 3 miles", ts: 1, pending: true }] }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "working" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "done", cards: [{ kind: "saved", label: "Run 3 mi", actionId: "a2" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { chatStore } = await fresh();
    chatStore.open("2099-10-03");
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledWith("/api/chat?clientMsgId=u2");
    expect(saved().msgs).toMatchObject([{ id: "u2", pending: false }, { role: "app", card: { kind: "saved", label: "Run 3 mi" } }]);
  });

  it("a message the server never got shows as failed after a reload", async () => {
    storage.set("talos.chat.v3", JSON.stringify({ day: "2099-10-04", msgs: [{ id: "u3", role: "user", text: "hi", ts: 1, pending: true }] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "unknown" }) }));
    vi.useFakeTimers();
    const { chatStore } = await fresh();
    chatStore.open("2099-10-04");
    await vi.runAllTimersAsync();
    expect(saved().msgs).toMatchObject([{ id: "u3", pending: false }, { role: "app", card: { kind: "failed" } }]);
  });
});
