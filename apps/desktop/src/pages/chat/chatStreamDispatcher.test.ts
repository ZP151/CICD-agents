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
  uiAvailable: boolean;
  workflowState: WorkflowEventState | null;
};

function makeAdapter(): StreamDispatcherAdapterTestDouble {
  const adapter: StreamDispatcherAdapterTestDouble = {
    bubbles: [],
    calls: [],
    finalised: undefined,
    sessionId: null,
    uiAvailable: false,
    workflowState: null,
    uiChunkStreamAvailable: vi.fn(() => adapter.uiAvailable),
    setUiChunkStreamAvailable: vi.fn((available: boolean) => {
      adapter.uiAvailable = available;
      adapter.calls.push(`ui:${available}`);
    }),
    handleUiChunk: vi.fn((chunk) => {
      adapter.calls.push(`ui-chunk:${chunk?.type ?? "missing"}`);
    }),
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
    upsertToolBubble: vi.fn((snapshot) => {
      adapter.calls.push(`tool:${snapshot.toolName}`);
    }),
    appendToolOutputDelta: vi.fn((toolName, stream, delta) => {
      adapter.calls.push(`tool-delta:${toolName ?? ""}:${stream ?? ""}:${delta ?? ""}`);
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
    addErrorBubbleOnce: vi.fn((text: string) => {
      adapter.calls.push(`error:${text}`);
    }),
  };
  return adapter;
}

describe("dispatchChatStreamEvent", () => {
  it("prevents legacy render events from duplicating visible output after ui.chunk starts", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({
      type: "ui.chunk",
      uiChunk: { type: "text-delta", id: "text-1", delta: "canonical" },
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

    expect(adapter.handleUiChunk).toHaveBeenCalledTimes(1);
    expect(adapter.appendAssistantDelta).not.toHaveBeenCalled();
    expect(adapter.addBubble).not.toHaveBeenCalled();
    expect(adapter.upsertToolBubble).not.toHaveBeenCalled();
    expect(adapter.appendToolOutputDelta).not.toHaveBeenCalled();
    expect(adapter.uiAvailable).toBe(true);
    expect(adapter.calls).toEqual([
      "ui-chunk:text-delta",
      "ui:true",
      "ui:true",
      "ui:true",
      "ui:true",
      "ui:true",
    ]);
  });

  it("still accepts control events during canonical streaming and closes on done", () => {
    const adapter = makeAdapter();

    dispatchChatStreamEvent({
      type: "ui.chunk",
      uiChunk: { type: "text-delta", id: "text-1", delta: "canonical" },
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "workflow_state",
      state: {
        status: "running",
        currentStep: "Running git status",
        completedTools: ["git_status"],
      },
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "done",
      result: {
        response: "Done",
        streamedResponse: "canonical",
        riskLevel: "low",
        actionsTaken: ["Read changes"],
        suggestions: [],
      },
    } as ChatEventPayload, adapter, { refreshHistoryOnDone: true });

    expect(adapter.setWorkflowState).toHaveBeenCalledTimes(1);
    expect(adapter.workflowState).toMatchObject({
      status: "running",
      currentStep: "Running git status",
    });
    expect(adapter.finalised).toMatchObject({
      text: "Done",
      streamedText: "canonical",
    });
    expect(adapter.uiAvailable).toBe(false);
    expect(adapter.refreshHistory).toHaveBeenCalledTimes(1);
  });

  it("releases busy state when a follow-up approval is required", () => {
    const adapter = makeAdapter();
    const approval = {
      id: "approval-git-commit",
      action: {
        tool: "git_commit",
        args: { message: "chore: add feature" },
        description: "Commit staged changes",
      },
      riskLevel: "medium",
      explanation: "Commit staged changes",
    };

    dispatchChatStreamEvent({
      type: "workflow_state",
      state: {
        status: "waiting_for_approval",
        currentStep: "Commit staged changes",
        completedTools: ["git_add"],
        pendingApproval: approval,
      },
    } as ChatEventPayload, adapter);
    dispatchChatStreamEvent({
      type: "approval_required",
      approval,
    } as ChatEventPayload, adapter);

    expect(adapter.showApprovalRequest).toHaveBeenCalledTimes(2);
    expect(adapter.calls).toContain("busy:false");
    expect(adapter.calls).toContain("clearCancel");
    expect(adapter.calls.filter((call) => call === "busy:false")).toHaveLength(2);
    expect(adapter.calls.filter((call) => call === "clearCancel")).toHaveLength(2);
  });
});
