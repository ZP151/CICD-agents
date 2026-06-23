import { describe, expect, it } from "vitest";
import type { ChatEventPayload } from "../../api.js";
import type { Bubble } from "./chat.types.js";
import {
  markExecutingPendingBubblesDone,
  markPendingBubbleCancelled,
  markPendingBubbleDone,
  toolPartStateFromResult,
  updateToolEndBubble,
} from "./chatToolStreamState.js";

describe("chat tool stream state", () => {
  it("maps tool results to conversation part states", () => {
    expect(toolPartStateFromResult(true)).toBe("result");
    expect(toolPartStateFromResult(false)).toBe("error");
    expect(toolPartStateFromResult(undefined)).toBe("running");
  });

  it("finalizes the latest running tool bubble and records the result part", () => {
    const bubbles: Bubble[] = [
      {
        id: "tool-1",
        kind: "tool",
        toolName: "git_status",
        toolArgs: { short: true },
        toolOpen: true,
      },
    ];

    const next = updateToolEndBubble(bubbles, {
      type: "tool_end",
      name: "git_status",
      ok: true,
      summary: "clean",
      toolResult: { stdout: "" },
    } as ChatEventPayload);

    expect(next[0]).toMatchObject({
      kind: "tool",
      toolName: "git_status",
      toolOk: true,
      toolSummary: "clean",
      toolOpen: false,
    });
    const part = next[0]?.parts?.[0];
    expect(part).toBeDefined();
    expect(part).toMatchObject({
      type: "tool_call",
      toolName: "git_status",
      state: "result",
      output: { stdout: "" },
    });
  });

  it("updates pending confirmation execution states", () => {
    const bubbles: Bubble[] = [
      { id: "p1", kind: "pending_confirm", pendingStatus: "executing" },
      { id: "p2", kind: "pending_confirm", pendingStatus: "waiting" },
    ];

    expect(markExecutingPendingBubblesDone(bubbles)).toEqual([
      expect.objectContaining({ id: "p2", pendingStatus: "waiting" }),
    ]);
    expect(markPendingBubbleDone(bubbles, "p1")).toEqual([
      expect.objectContaining({ id: "p2", pendingStatus: "waiting" }),
    ]);
    expect(markPendingBubbleCancelled(bubbles, "p2")).toEqual([
      expect.objectContaining({ id: "p1", pendingStatus: "executing" }),
    ]);
  });
});
