import { describe, expect, it } from "vitest";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import type { ApprovalRequest } from "./chat.types.js";

const makeId = (() => {
  let next = 0;
  return () => `bubble-${++next}`;
})();

describe("chat bubble reducer", () => {
  it("drives assistant visible streaming through reducer actions", () => {
    const started = reduceChatBubbles([], {
      type: "append_visible_assistant_delta",
      delta: "Hel",
    }, makeId);
    const appended = reduceChatBubbles(started, {
      type: "append_visible_assistant_delta",
      delta: "lo",
    }, makeId);
    const stopped = reduceChatBubbles(appended, { type: "stop_streaming" }, makeId);

    expect(appended).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Hello", streaming: true }),
    ]);
    expect(stopped).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Hello", streaming: false }),
    ]);
  });

  it("drives approval and pending status updates through reducer actions", () => {
    const approval: ApprovalRequest = {
      id: "approval-1",
      riskLevel: "medium",
      explanation: "Review staged files before committing.",
      action: {
        tool: "git_commit",
        args: { message: "Refactor chat reducer" },
        description: "Commit staged files",
      },
    };

    const waiting = reduceChatBubbles([], { type: "show_approval", approval }, makeId);
    const executing = reduceChatBubbles(waiting, {
      type: "mark_pending_status",
      id: waiting[0]?.id ?? "",
      status: "executing",
    }, makeId);
    const cancelled = reduceChatBubbles(executing, {
      type: "mark_pending_status",
      id: waiting[0]?.id ?? "",
      status: "cancelled",
    }, makeId);

    expect(waiting[0]).toMatchObject({
      kind: "pending_confirm",
      pendingTool: "git_commit",
      pendingStatus: "waiting",
    });
    expect(executing[0]).toMatchObject({ pendingStatus: "executing" });
    expect(cancelled).toEqual([]);
  });

  it("toggles tool cards through reducer actions", () => {
    const started = reduceChatBubbles([], {
      type: "add",
      bubble: { id: "tool-1", kind: "tool", toolName: "git_status", toolOpen: false },
    }, makeId);
    const toggled = reduceChatBubbles(started, { type: "toggle_tool", id: "tool-1" }, makeId);

    expect(toggled[0]).toMatchObject({ toolOpen: true });
  });

  it("updates legacy confirm cards through reducer actions", () => {
    const withConfirm = reduceChatBubbles([], {
      type: "add",
      bubble: { id: "confirm-1", kind: "confirm", confirmed: null },
    }, makeId);
    const confirmed = reduceChatBubbles(withConfirm, {
      type: "resolve_confirm",
      id: "confirm-1",
      confirmed: true,
    }, makeId);

    expect(confirmed.at(-1)).toMatchObject({ id: "confirm-1", confirmed: true });
  });

  it("appends direct workflow result bubbles as a single reducer action", () => {
    const next = reduceChatBubbles([
      { id: "user-1", kind: "user", text: "Run tests" },
    ], {
      type: "add_many",
      bubbles: [
        { id: "tool-1", kind: "tool", toolName: "validation_command" },
        { id: "assistant-1", kind: "assistant", text: "Tests passed" },
      ],
    }, makeId);

    expect(next).toHaveLength(3);
    expect(next.map((bubble) => bubble.id)).toEqual(["user-1", "tool-1", "assistant-1"]);
  });
});
