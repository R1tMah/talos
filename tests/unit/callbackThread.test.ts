import { describe, expect, it } from "vitest";
import { buildTree, type CallbackUpdate } from "@/lib/callbacksData";

let t = 0;
const u = (id: string, parentId: string | null = null, deleted = false): CallbackUpdate => ({
  id, parentId, body: id, createdAt: new Date(Date.UTC(2026, 10, 1, 0, t++)).toISOString(), edited: false, deleted,
});

const shape = (nodes: ReturnType<typeof buildTree>): unknown =>
  nodes.map((n) => (n.replies.length ? { [n.id]: shape(n.replies) } : n.id));

describe("callback thread tree", () => {
  it("nests replies under their parents, oldest first", () => {
    const tree = buildTree([u("a"), u("b"), u("a1", "a"), u("a1x", "a1"), u("a2", "a")].reverse());
    expect(shape(tree)).toEqual([{ a: [{ a1: ["a1x"] }, "a2"] }, "b"]);
    expect(tree[0].count).toBe(4);
  });

  it("keeps a deleted update while it has live replies, and drops it otherwise", () => {
    const tree = buildTree([u("a", null, true), u("a1", "a"), u("b", null, true), u("c")]);
    expect(shape(tree)).toEqual([{ a: ["a1"] }, "c"]);
    expect(tree[0].count).toBe(1);
  });

  it("drops a deleted chain with nothing live under it", () => {
    expect(buildTree([u("a", null, true), u("a1", "a", true)])).toEqual([]);
  });

  it("puts a reply whose parent is missing at the top level", () => {
    expect(shape(buildTree([u("orphan", "gone")]))).toEqual(["orphan"]);
  });
});
