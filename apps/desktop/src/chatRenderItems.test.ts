import { describe, expect, it } from "vitest";
import { groupChatRenderItems, type ChatRenderBubbleLike } from "./chatRenderItems.js";

interface TestBubble extends ChatRenderBubbleLike {
  label?: string;
}

describe("groupChatRenderItems", () => {
  it("renders each user turn as execution, assistant summary, then approval", () => {
    const items = groupChatRenderItems<TestBubble>([
      { id: "u1", kind: "user" },
      { id: "m1", kind: "assistant" },
      { id: "t1", kind: "tool", label: "git_status" },
      { id: "t2", kind: "tool", label: "git_diff" },
      { id: "a1", kind: "pending_confirm", label: "git_add approval" },
    ]);

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ kind: "bubble", bubble: { id: "u1" } });
    expect(items[1]).toMatchObject({
      kind: "tool-group",
      tools: [{ id: "t1" }, { id: "t2" }],
    });
    expect(items[2]).toMatchObject({ kind: "bubble", bubble: { id: "m1" } });
    expect(items[3]).toMatchObject({ kind: "bubble", bubble: { id: "a1" } });
  });

  it("keeps turn boundaries when sorting tool records before summaries", () => {
    const items = groupChatRenderItems<TestBubble>([
      { id: "u1", kind: "user" },
      { id: "m1", kind: "assistant" },
      { id: "t1", kind: "tool" },
      { id: "u2", kind: "user" },
      { id: "m2", kind: "assistant" },
      { id: "a1", kind: "pending_confirm" },
    ]);

    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({ kind: "bubble", bubble: { id: "u1" } });
    expect(items[1]).toMatchObject({ kind: "tool-group", tools: [{ id: "t1" }] });
    expect(items[2]).toMatchObject({ kind: "bubble", bubble: { id: "m1" } });
    expect(items[3]).toMatchObject({ kind: "bubble", bubble: { id: "u2" } });
    expect(items[4]).toMatchObject({ kind: "bubble", bubble: { id: "m2" } });
    expect(items[5]).toMatchObject({ kind: "bubble", bubble: { id: "a1" } });
  });
});
