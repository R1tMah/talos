// A scripted stand-in for the Anthropic SDK, so agent tests never call the API.
//
//   vi.mock("@anthropic-ai/sdk", async () => (await import("../helpers/model")).sdkMock);
//   model.toolCalls({ name: "log_weight", input: {...} });

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type Reply = { content: Block[]; stop_reason: string } | Error;

export const model = {
  queue: [] as Reply[],
  requests: [] as Record<string, unknown>[],
  reset() {
    this.queue = [];
    this.requests = [];
  },
  /** The next request returns these tool calls (plus any text blocks given). */
  toolCalls(...calls: { name: string; input: Record<string, unknown> }[]) {
    this.queue.push({ stop_reason: "tool_use", content: calls.map((c, i) => ({ type: "tool_use" as const, id: `tu${i}`, ...c })) });
  },
  /** The next request returns prose only. */
  text(text: string) {
    this.queue.push({ stop_reason: "end_turn", content: [{ type: "text", text }] });
  },
  raw(reply: Reply) {
    this.queue.push(reply);
  },
  /** The next request throws, like a timeout or API error. */
  fail(message = "timeout") {
    this.queue.push(Object.assign(new Error(message), { status: 529 }));
  },
};

class FakeAnthropic {
  static ToolUseBlock = class {};
  messages = {
    create: async (req: Record<string, unknown>) => {
      model.requests.push(req);
      const next = model.queue.shift();
      if (!next) throw new Error("test did not script a model reply");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

export const sdkMock = { default: FakeAnthropic };
