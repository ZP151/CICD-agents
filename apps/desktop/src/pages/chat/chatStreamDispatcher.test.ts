import { describe, expect, it, vi } from "vitest";
import type { ChatEventPayload } from "../../api.js";
import type { Bubble, WorkflowEventState } from "./chat.types.js";
import {
  dispatchChatStreamEvent,
  type ChatStreamDispatcherAdapter,
} from "./chatStreamDispatcher.js";
import type { WorkflowStateUpdate } from "./chatWorkflowStreamState.js";

type StreamDispatcherAdapterTestDouble = ChatStreamDispatcherAdapter & {
  bubbles: Bubble[];
  calls: string[];
  finalised?: { text: string; meta: Bubble["meta"] | undefined; streamedText?: string };
  sessionId: string | null;
  workflowState: WorkflowEventState | null;
};

function makeAdapter(): StreamDispatcherAdapterTestDouble {
  const adapter: StreamDispatcherAdapterTestDouble = {
    bubbles: [],
    calls: [],
    finalised: undefined,
    sessionId: null,
    workflowState: null,
    setSessionId: vi.fn((sessionId: string) => {
      adapter.sessionId = sessionId;
      adapter.calls.push(`session:${sessionId}`);
    }),
    setStatusText: vi.fn((status: string | null) => {
      adapter.calls.push(`status:${status ?? "null"}`);
    }),
    appendAssistantDelta: vi.fn((delta: string) => {
      adapter.calls.push(`assistant:${delta}`);
    }),
    stopStreaming: vi.fn(() => {
      adapter.calls.push("stop");
    }),
    updateBubbles: vi.fn((updater: (prev: Bubble[]) => Bubble[]) => {
      adapter.bubbles = updater(adapter.bubbles);
      adapter.calls.push("updateBubbles");
    }),
    addBubble: vi.fn((bubble: Bubble) => {
      adapter.bubbles = [...adapter.bubbles, bubble];
      adapter.calls.push(`bubble:${bubble.kind}`);
    }),
    currentSessionId: vi.fn(() => adapter.sessionId),
    setWorkflowState: vi.fn((update: WorkflowStateUpdate) => {
      adapter.workflowState = typeof update === "function" ? update(adapter.workflowState) : update;
      adapter.calls.push(`workflow:${adapter.workflowState?.status ?? "null"}`);
    }),
    showApprovalRequest: vi.fn(() => {
      adapter.calls.push("approval");
    }),
    finaliseWithResponse: vi.fn((text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => {
      adapter.finalised = { text, meta, streamedText };
      adapter.calls.push(`final:${text}`);
    }),
    setBusy: vi.fn((busy: boolean) => {
      adapter.calls.push(`busy:${busy}`);
    }),
    clearCancel: vi.fn(() => {
      adapter.calls.push("clearCancel");
    }),
    refreshHistory: vi.fn(() => {
      adapter.calls.push("refreshHistory");
    }),
  };
  return adapter;
}

describe("dispatchChatStreamEvent", () => {
  it("renders canonical approval within the same Turn without relying on legacy SSE", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({
      type: "turn.approval.requested", turnId: "turn-1", sequence: 1,
      approval: {
        id: "approval-1", riskLevel: "medium", explanation: "not rendered",
        action: { tool: "git_push", args: { branch: "main" }, description: "Push the current branch" },
      },
    }, adapter);

    expect(adapter.showApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({
      id: "approval-1", action: expect.objectContaining({ tool: "git_push", args: { branch: "main" } }),
    }), "turn-1");
    expect(adapter.bubbles[0]?.turnTranscript?.blocks).toContainEqual(expect.objectContaining({
      kind: "approval", id: "approval-1", status: "waiting",
    }));
    expect(adapter.calls).toContain("busy:false");
  });

  it("drops legacy live-render events instead of creating a second transcript", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({
      type: "ui.chunk",
      uiChunk: { type: "text-delta", id: "text-1", delta: "legacy" },
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "assistant_delta",
      delta: "legacy duplicate",
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "message",
      text: "legacy final duplicate",
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "tool_start",
      name: "git_status",
      args: { short: true },
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "tool_output_delta",
      name: "git_status",
      stream: "stdout",
      delta: " M file.ts",
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "progress",
      message: "Reading project context",
    } as ChatEventPayload, adapter);

    expect(adapter.appendAssistantDelta).not.toHaveBeenCalled();
    expect(adapter.addBubble).not.toHaveBeenCalled();
    expect(adapter.updateBubbles).toHaveBeenCalledTimes(1);
    expect(adapter.calls).not.toContain("status:Reading project context");
  });

  it("still accepts session control events during canonical streaming", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({
      type: "session",
      sessionId: "session-42",
    } as ChatEventPayload, adapter, { onSession: vi.fn() });

    expect(adapter.sessionId).toBe("session-42");
  });

  it("seals the active transcript with its completed work duration", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({
      type: "turn.started",
      turnId: "turn-1",
    }, adapter);

    dispatchChatStreamEvent({
      type: "turn.completed",
      turnId: "turn-1",
      elapsedMs: 65_400,
    }, adapter);

    expect(adapter.stopStreaming).toHaveBeenCalledTimes(1);
    expect(adapter.bubbles).toEqual([
      expect.objectContaining({
        kind: "system",
        text: "Worked",
        turnTranscript: expect.objectContaining({ status: "completed", elapsedMs: 65_400, executionSealed: true }),
      }),
    ]);
  });

  it("does not append a second activity marker when completion is delivered twice", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1" }, adapter);
    dispatchChatStreamEvent({ type: "turn.completed", turnId: "turn-1", elapsedMs: 1_000 }, adapter);
    dispatchChatStreamEvent({ type: "turn.completed", turnId: "turn-1", elapsedMs: 1_000 }, adapter);

    expect(adapter.bubbles).toHaveLength(1);
    expect(adapter.bubbles[0]).toMatchObject({
      text: "Worked",
      turnTranscript: { status: "completed", elapsedMs: 1_000, executionSealed: true },
    });
  });

  it("keeps terminal durations bound to their own turn ids", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-a" }, adapter);
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-b" }, adapter);
    dispatchChatStreamEvent({ type: "turn.completed", turnId: "turn-a", elapsedMs: 3_000 }, adapter);
    dispatchChatStreamEvent({ type: "turn.cancelled", turnId: "turn-b", elapsedMs: 8_000 }, adapter);

    expect(adapter.bubbles).toEqual([
      expect.objectContaining({
        turnId: "turn-a",
        text: "Worked",
        turnTranscript: expect.objectContaining({ status: "completed", elapsedMs: 3_000 }),
      }),
      expect.objectContaining({
        turnId: "turn-b",
        text: "Cancelled",
        turnTranscript: expect.objectContaining({ status: "cancelled", elapsedMs: 8_000 }),
      }),
    ]);
  });

  it("renders immediate visible feedback before repository context or the model can respond", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({
      type: "turn.started",
      turnId: "turn-1",
    }, adapter);

    expect(adapter.setStatusText).toHaveBeenCalledWith(null);
    expect(adapter.bubbles).toEqual([
      expect.objectContaining({
        kind: "system",
        text: "Working",
        turnId: "turn-1",
        turnTranscript: expect.objectContaining({ status: "working" }),
      }),
    ]);
  });

  it("keeps public work and command evidence inside the transcript before streaming the final response", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({
      type: "turn.work.statement", turnId: "turn-1", sequence: 1, blockId: "inspect",
      message: "I’ll inspect the working tree before deciding the next action.",
    }, adapter);
    dispatchChatStreamEvent({ type: "turn.tool_group.started", turnId: "turn-1", sequence: 2, groupId: "inspect" }, adapter);
    dispatchChatStreamEvent({
      type: "turn.tool.started", turnId: "turn-1", sequence: 3, groupId: "inspect", commandId: "status",
      name: "git_status", args: { command: "git status --short --branch" },
    }, adapter);
    dispatchChatStreamEvent({
      type: "turn.tool.completed", turnId: "turn-1", sequence: 4, commandId: "status", ok: true, durationMs: 420,
    }, adapter);
    dispatchChatStreamEvent({ type: "turn.execution.completed", turnId: "turn-1", sequence: 5, elapsedMs: 800 }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-1", sequence: 6, delta: "The tree is clean." }, adapter);
    dispatchChatStreamEvent({
      type: "turn.final.completed", turnId: "turn-1", sequence: 7, emittedAt: 1_800, finalText: "The tree is clean.",
      result: { response: "The tree is clean.", riskLevel: "low", actionsTaken: ["git_status"], suggestions: [] },
    }, adapter);
    dispatchChatStreamEvent({ type: "turn.finished", turnId: "turn-1", sequence: 8, elapsedMs: 800 }, adapter);

    expect(adapter.bubbles[0]?.turnTranscript).toMatchObject({
      status: "completed",
      executionSealed: true,
      blocks: [
        expect.objectContaining({ kind: "statement", id: "inspect" }),
        expect.objectContaining({ kind: "tool_group", commands: [expect.objectContaining({ status: "succeeded" })] }),
      ],
    });
    expect(adapter.appendAssistantDelta).toHaveBeenCalledWith("The tree is clean.");
    expect(adapter.finalised).toMatchObject({ text: "The tree is clean.", streamedText: "The tree is clean." });
    expect(adapter.finalised?.meta).toMatchObject({ timestamp: 1_800 });
    expect(adapter.calls.indexOf("stop")).toBeLessThan(adapter.calls.indexOf("final:The tree is clean."));
    expect(adapter.setBusy).toHaveBeenCalledWith(false);
  });

  it("buffers a premature final until the Working canvas is sealed", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-1", sequence: 1, delta: "Conclusion." }, adapter);

    expect(adapter.appendAssistantDelta).not.toHaveBeenCalled();
    expect(adapter.bubbles[0]?.turnTranscript?.executionSealed).toBe(false);

    dispatchChatStreamEvent({
      type: "turn.final.completed", turnId: "turn-1", sequence: 2, finalText: "Conclusion.",
      result: { response: "Conclusion.", riskLevel: "low", actionsTaken: [], suggestions: [] },
    }, adapter);

    expect(adapter.bubbles[0]?.turnTranscript).toMatchObject({ status: "sealed", executionSealed: true });
    expect(adapter.appendAssistantDelta).toHaveBeenCalledWith("Conclusion.");
    expect(adapter.finalised).toBeUndefined();
    expect(adapter.stopStreaming).not.toHaveBeenCalled();

    dispatchChatStreamEvent({ type: "turn.finished", turnId: "turn-1", sequence: 3, elapsedMs: 300 }, adapter);

    expect(adapter.finalised).toMatchObject({ text: "Conclusion." });
    expect(adapter.stopStreaming).toHaveBeenCalledTimes(1);
  });

  it("keeps a cancelled Turn's public conclusion until the terminal footer can be rendered", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({ type: "turn.execution.completed", turnId: "turn-1", sequence: 1, elapsedMs: 40 }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-1", sequence: 2, delta: "The action was cancelled." }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.completed", turnId: "turn-1", sequence: 3, finalText: "The action was cancelled." }, adapter);
    dispatchChatStreamEvent({ type: "turn.cancelled", turnId: "turn-1", sequence: 4, elapsedMs: 60 }, adapter);

    expect(adapter.appendAssistantDelta).toHaveBeenCalledWith("The action was cancelled.");
    expect(adapter.finalised).toMatchObject({ text: "The action was cancelled." });
    expect(adapter.bubbles[0]?.turnTranscript).toMatchObject({ status: "cancelled", executionSealed: true });
    expect(adapter.stopStreaming).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate or out-of-order final events instead of replaying conclusion text", () => {
    const adapter = makeAdapter();
    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-sequence", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({ type: "turn.execution.completed", turnId: "turn-sequence", sequence: 1, elapsedMs: 20 }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-sequence", sequence: 2, delta: "One conclusion." }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-sequence", sequence: 2, delta: "Duplicate conclusion." }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.completed", turnId: "turn-sequence", sequence: 3, finalText: "One conclusion." }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.completed", turnId: "turn-sequence", sequence: 3, finalText: "Duplicate conclusion." }, adapter);
    dispatchChatStreamEvent({ type: "turn.finished", turnId: "turn-sequence", sequence: 4, elapsedMs: 20 }, adapter);
    dispatchChatStreamEvent({ type: "turn.final.delta", turnId: "turn-sequence", sequence: 3, delta: "Late conclusion." }, adapter);

    expect(adapter.appendAssistantDelta).toHaveBeenCalledTimes(1);
    expect(adapter.appendAssistantDelta).toHaveBeenCalledWith("One conclusion.");
    expect(adapter.finalised).toMatchObject({ text: "One conclusion." });
  });

  it("releases busy state when a canonical approval is required", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, adapter);
    dispatchChatStreamEvent({
      type: "turn.approval.requested", turnId: "turn-1", sequence: 1,
      approval: {
        id: "approval-git-commit",
        action: {
          tool: "git_commit",
          args: { message: "chore: add feature" },
          description: "Commit staged changes",
        },
        riskLevel: "medium",
        explanation: "Commit staged changes",
      },
    }, adapter);
    dispatchChatStreamEvent({
      type: "turn.approval.resolved", turnId: "turn-1", sequence: 2, approvalId: "approval-git-commit", approved: true,
    }, adapter);

    expect(adapter.showApprovalRequest).toHaveBeenCalledTimes(1);
    expect(adapter.calls).toContain("busy:false");
    expect(adapter.calls).toContain("clearCancel");
    expect(adapter.workflowState).toMatchObject({ status: "running" });
  });
});
