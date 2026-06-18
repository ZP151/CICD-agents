import { describe, expect, it, vi } from "vitest";
import type { ChatUiChunk } from "../../api.js";
import type { ApprovalRequest, WorkflowEventState } from "./chat.types.js";
import {
  dispatchChatUiChunk,
  type ChatUiChunkDispatcherAdapter,
} from "./chatUiChunkDispatcher.js";

type UiChunkAdapterTestDouble = ChatUiChunkDispatcherAdapter & {
  calls: string[];
  workflowState: WorkflowEventState | null;
};

const approval: ApprovalRequest = {
  id: "approval-1",
  riskLevel: "medium",
  explanation: "Review exact git args.",
  action: {
    tool: "git_commit",
    args: { message: "Refactor chat streaming" },
    description: "Commit staged changes",
  },
};

function makeAdapter(): UiChunkAdapterTestDouble {
  const adapter: UiChunkAdapterTestDouble = {
    calls: [],
    workflowState: null,
    setUiChunkStreamAvailable: vi.fn((available: boolean) => {
      adapter.calls.push(`ui:${available}`);
    }),
    setBusy: vi.fn((busy: boolean) => {
      adapter.calls.push(`busy:${busy}`);
    }),
    setStatusText: vi.fn((status: string | null) => {
      adapter.calls.push(`status:${status ?? "null"}`);
    }),
    clearCancel: vi.fn(() => {
      adapter.calls.push("clearCancel");
    }),
    addErrorBubbleOnce: vi.fn((message: string) => {
      adapter.calls.push(`error:${message}`);
    }),
    appendAssistantDelta: vi.fn((delta: string, textPartId?: string) => {
      adapter.calls.push(`text-delta:${textPartId ?? ""}:${delta}`);
    }),
    appendToolOutputDelta: vi.fn((toolName, stream, delta, toolCallId) => {
      adapter.calls.push(`tool-delta:${toolCallId ?? ""}:${toolName ?? ""}:${stream ?? ""}:${delta ?? ""}`);
    }),
    mergeAssistantMetadata: vi.fn(() => {
      adapter.calls.push("metadata");
    }),
    setWorkflowState: vi.fn((update) => {
      adapter.workflowState = typeof update === "function" ? update(adapter.workflowState) : update;
      adapter.calls.push(`workflow:${adapter.workflowState?.status ?? "null"}`);
    }),
    showApprovalRequest: vi.fn(() => {
      adapter.calls.push("approval");
    }),
    startAssistantTextPart: vi.fn((textPartId: string) => {
      adapter.calls.push(`text-start:${textPartId}`);
    }),
    stopStreaming: vi.fn((textPartId?: string) => {
      adapter.calls.push(`stop:${textPartId ?? ""}`);
    }),
    upsertToolBubble: vi.fn((snapshot, options) => {
      adapter.calls.push(`tool:${snapshot.toolCallId}:${snapshot.state}:${options?.ok ?? ""}`);
    }),
  };
  return adapter;
}

describe("dispatchChatUiChunk", () => {
  it("dispatches assistant text chunks through the canonical UI chunk interface", () => {
    const adapter = makeAdapter();

    dispatchChatUiChunk({ type: "text-start", id: "text-1" }, adapter);
    dispatchChatUiChunk({ type: "text-delta", id: "text-1", delta: "hello" }, adapter);
    dispatchChatUiChunk({ type: "text-end", id: "text-1" }, adapter);

    expect(adapter.calls).toEqual([
      "ui:true",
      "status:null",
      "text-start:text-1",
      "ui:true",
      "status:null",
      "text-delta:text-1:hello",
      "ui:true",
      "stop:text-1",
    ]);
  });

  it("dispatches tool input and output chunks into execution timeline updates", () => {
    const adapter = makeAdapter();

    dispatchChatUiChunk({
      type: "tool-input-available",
      toolCallId: "tool-1",
      toolName: "git_status",
      input: { short: true },
    }, adapter);
    dispatchChatUiChunk({
      type: "tool-output-delta",
      toolCallId: "tool-1",
      toolName: "git_status",
      stream: "stdout",
      delta: " M file.ts",
    }, adapter);
    dispatchChatUiChunk({
      type: "tool-output-available",
      toolCallId: "tool-1",
      toolName: "git_status",
      output: { stdout: " M file.ts" },
      summary: "1 modified",
    }, adapter);

    expect(adapter.calls).toEqual([
      "ui:true",
      "tool:tool-1:input-available:",
      "ui:true",
      "tool-delta:tool-1:git_status:stdout: M file.ts",
      "ui:true",
      "tool:tool-1:result:true",
    ]);
  });

  it("dispatches canonical approval and workflow chunks without relying on legacy events", () => {
    const adapter = makeAdapter();
    const runningState: WorkflowEventState = {
      status: "running",
      currentStep: "Inspecting changes",
      completedTools: ["git_status"],
    };

    dispatchChatUiChunk({ type: "workflow-updated", state: runningState }, adapter);
    dispatchChatUiChunk({ type: "approval-required", approval }, adapter);
    dispatchChatUiChunk({ type: "approval-resolved", approvalId: approval.id, approved: true }, adapter);

    expect(adapter.setWorkflowState).toHaveBeenCalledTimes(3);
    expect(adapter.showApprovalRequest).toHaveBeenCalledWith(approval);
    expect(adapter.workflowState).toMatchObject({
      status: "running",
      currentStep: "Executing approved action",
      pendingApproval: undefined,
    });
    expect(adapter.calls).toContain("status:Executing");
    expect(adapter.calls).toContain("status:Waiting for approval");
    expect(adapter.calls).toContain("status:Approval accepted");
  });

  it("dispatches terminal chunks and clears active turn state", () => {
    const finishAdapter = makeAdapter();
    dispatchChatUiChunk({ type: "finish", finishReason: "stop" }, finishAdapter);

    expect(finishAdapter.calls).toEqual([
      "ui:true",
      "stop:",
      "ui:false",
      "busy:false",
      "status:null",
      "clearCancel",
    ]);

    const errorAdapter = makeAdapter();
    dispatchChatUiChunk({ type: "error", errorText: "LLM failed" }, errorAdapter);

    expect(errorAdapter.calls).toEqual([
      "ui:true",
      "stop:",
      "ui:false",
      "error:LLM failed",
      "busy:false",
      "status:null",
      "clearCancel",
    ]);
  });

  it("ignores invalid internal approval and workflow payloads defensively", () => {
    const adapter = makeAdapter();

    dispatchChatUiChunk({ type: "approval-required", approval: { id: "bad" } } as ChatUiChunk, adapter);
    dispatchChatUiChunk({ type: "workflow-updated", state: { status: "running" } } as ChatUiChunk, adapter);

    expect(adapter.calls).toEqual(["ui:true", "ui:true"]);
  });
});
