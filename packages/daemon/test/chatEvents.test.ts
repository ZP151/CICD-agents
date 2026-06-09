import { describe, expect, it } from "vitest";
import type { ChatEvent } from "@cicd-agent/core";
import { chatEventToSseEvents, sessionStartedEvent } from "../src/chatEvents.js";

describe("chat SSE event compatibility layer", () => {
  it("emits legacy and canonical session events", () => {
    expect(sessionStartedEvent("s1")).toEqual([
      { event: "session", payload: { sessionId: "s1" } },
      {
        event: "session.started",
        payload: { type: "session.started", sessionId: "s1", legacyType: "session" },
      },
    ]);
  });

  it.each([
    ["assistant_delta", "text.delta"],
    ["tool_start", "tool.started"],
    ["tool_end", "tool.completed"],
    ["workflow_state", "workflow.updated"],
    ["approval_required", "approval.required"],
    ["approval_resolved", "approval.resolved"],
    ["done", "final"],
  ])("emits a canonical alias for %s", (legacyType, canonicalType) => {
    const event = minimalEvent(legacyType);
    const sse = chatEventToSseEvents(event);

    expect(sse[0]).toEqual({ event: legacyType, payload: event });
    expect(sse[1]).toEqual({
      event: canonicalType,
      payload: {
        ...event,
        type: canonicalType,
        legacyType,
      },
    });
  });
});

function minimalEvent(type: string): ChatEvent {
  switch (type) {
    case "assistant_delta":
      return { type, delta: "hello" };
    case "tool_start":
      return { type, name: "git_status", args: {} };
    case "tool_end":
      return { type, name: "git_status", ok: true, summary: "ok", result: {} };
    case "workflow_state":
      return { type, state: { status: "done", currentStep: "done", completedTools: [] } };
    case "approval_required":
      return {
        type,
        approval: {
          id: "a1",
          action: { tool: "git_push", args: { branch: "feature/x" }, description: "Push branch" },
          riskLevel: "high",
          explanation: "Push branch",
        },
      };
    case "approval_resolved":
      return { type, approvalId: "a1", approved: true };
    case "done":
      return {
        type,
        result: {
          response: "done",
          riskLevel: "low",
          actionsTaken: [],
          suggestions: [],
          toolCallsMade: [],
          usedLlm: false,
        },
      };
    default:
      throw new Error(`unsupported test event: ${type}`);
  }
}
