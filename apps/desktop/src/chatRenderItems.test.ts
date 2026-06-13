import { describe, expect, it } from "vitest";
import { groupChatRenderItems, type ChatRenderBubbleLike } from "./chatRenderItems.js";

interface TestBubble extends ChatRenderBubbleLike {
  label?: string;
}

describe("groupChatRenderItems", () => {
  it("attaches a following approval to the preceding tool group", () => {
    const items = groupChatRenderItems<TestBubble>([
      { id: "u1", kind: "user" },
      { id: "t1", kind: "tool", label: "git_status" },
      { id: "t2", kind: "tool", label: "git_diff" },
      { id: "a1", kind: "pending_confirm", label: "git_add approval" },
      { id: "m1", kind: "assistant" },
    ]);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "bubble", bubble: { id: "u1" } });
    expect(items[1]).toMatchObject({
      kind: "tool-group",
      tools: [{ id: "t1" }, { id: "t2" }],
      approval: { id: "a1" },
    });
    expect(items[2]).toMatchObject({ kind: "bubble", bubble: { id: "m1" } });
  });

  it("leaves standalone approvals as normal bubbles", () => {
    const items = groupChatRenderItems<TestBubble>([
      { id: "a1", kind: "pending_confirm" },
      { id: "t1", kind: "tool" },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "bubble", bubble: { id: "a1" } });
    expect(items[1]).toMatchObject({ kind: "tool-group", tools: [{ id: "t1" }] });
  });
});
