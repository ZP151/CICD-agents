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

  it("drives approval, confirm, and pending status updates through reducer actions", () => {
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
    const done = reduceChatBubbles(executing, { type: "mark_executing_pending_done" }, makeId);

    expect(waiting[0]).toMatchObject({
      kind: "pending_confirm",
      pendingTool: "git_commit",
      pendingStatus: "waiting",
    });
    expect(executing[0]).toMatchObject({ pendingStatus: "executing" });
    expect(done).toEqual([]);
  });

  it("drives tool execution and local UI controls through reducer actions", () => {
    const toolStarted = reduceChatBubbles([], {
      type: "upsert_tool",
      snapshot: {
        toolCallId: "tool-1",
        toolName: "git_status",
        state: "input-available",
        input: { short: true },
      },
    }, makeId);
    const withOutput = reduceChatBubbles(toolStarted, {
      type: "append_tool_output_delta",
      toolName: "git_status",
      stream: "stdout",
      delta: " M src/app.ts",
      toolCallId: "tool-1",
    }, makeId);
    const ended = reduceChatBubbles(withOutput, {
      type: "tool_end",
      event: {
        type: "tool_end",
        name: "git_status",
        ok: true,
        summary: "1 modified",
        toolCallId: "tool-1",
        toolResult: { stdout: " M src/app.ts", stderr: "", returncode: 0 },
      },
    }, makeId);
    const toggled = reduceChatBubbles(ended, { type: "toggle_tool", id: ended[0]?.id ?? "" }, makeId);

    expect(withOutput[0]).toMatchObject({
      kind: "tool",
      toolName: "git_status",
      toolOpen: true,
      toolLiveOutput: " M src/app.ts",
    });
    expect(ended[0]).toMatchObject({ toolOk: true, toolOpen: false, toolSummary: "1 modified" });
    expect(toggled[0]).toMatchObject({ toolOpen: true });
  });

  it("deduplicates error bubbles and updates legacy confirm cards", () => {
    const withError = reduceChatBubbles([], { type: "add_error_once", message: "Failed" }, makeId);
    const duplicate = reduceChatBubbles(withError, { type: "add_error_once", message: "Failed" }, makeId);
    const withConfirm = reduceChatBubbles(duplicate, {
      type: "add",
      bubble: { id: "confirm-1", kind: "confirm", confirmed: null },
    }, makeId);
    const confirmed = reduceChatBubbles(withConfirm, {
      type: "resolve_confirm",
      id: "confirm-1",
      confirmed: true,
    }, makeId);

    expect(duplicate).toHaveLength(1);
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
