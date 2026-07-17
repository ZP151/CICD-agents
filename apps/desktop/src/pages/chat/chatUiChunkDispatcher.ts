import type { ChatUiChunk } from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import type { ApprovalRequest, WorkflowEventState } from "./chat.types.js";
import {
  statusTextForApprovalResolved,
  statusTextForWorkflowState,
  workflowStateAfterApprovalResolved,
  workflowStateFromApprovalRequired,
  type WorkflowStateUpdate,
} from "./chatWorkflowStreamState.js";

export interface ChatUiChunkDispatcherAdapter {
  setUiChunkStreamAvailable: (available: boolean) => void;
  setBusy: (busy: boolean) => void;
  setStatusText: (status: string | null) => void;
  clearCancel: () => void;
  addErrorBubbleOnce: (message: string) => void;
  appendAssistantDelta: (delta: string, textPartId?: string) => void;
  appendToolOutputDelta: (
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => void;
  mergeAssistantMetadata: (metadata: unknown) => void;
  setWorkflowState: (update: WorkflowStateUpdate) => void;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  startAssistantTextPart: (textPartId: string) => void;
  stopStreaming: (textPartId?: string) => void;
  upsertToolBubble: (
    snapshot: ToolCallPartSnapshot,
    options?: {
      ok?: boolean;
      result?: unknown;
      open?: boolean;
      liveOutput?: string;
    },
  ) => void;
}

export function dispatchChatUiChunk(
  chunk: ChatUiChunk | undefined,
  adapter: ChatUiChunkDispatcherAdapter,
): void {
  if (!chunk) return;
  adapter.setUiChunkStreamAvailable(true);

  switch (chunk.type) {
    case "start":
      adapter.setStatusText("Thinking");
      break;
    case "text-start":
      adapter.setStatusText(null);
      adapter.startAssistantTextPart(chunk.id);
      break;
    case "text-delta":
      adapter.setStatusText(null);
      adapter.appendAssistantDelta(chunk.delta, chunk.id);
      break;
    case "text-end":
      adapter.stopStreaming(chunk.id);
      break;
    case "progress":
      adapter.setStatusText(chunk.message || "Working");
      break;
    case "finish":
      finishUiChunk(adapter);
      break;
    case "error":
      failUiChunk(chunk.errorText, adapter);
      break;
    case "tool-input-start":
      adapter.upsertToolBubble({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "input-streaming",
      });
      break;
    case "tool-input-available":
      adapter.upsertToolBubble({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "input-available",
        input: chunk.input,
      });
      break;
    case "tool-output-available":
      adapter.upsertToolBubble({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "result",
        output: chunk.output,
        summary: chunk.summary,
      }, {
        ok: true,
        result: chunk.output,
        open: false,
      });
      break;
    case "tool-output-error":
      adapter.upsertToolBubble({
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "error",
        output: { error: chunk.errorText },
        summary: chunk.summary,
      }, {
        ok: false,
        result: { error: chunk.errorText },
        open: true,
      });
      break;
    case "tool-output-delta":
      adapter.appendToolOutputDelta(chunk.toolName, chunk.stream, chunk.delta, chunk.toolCallId);
      break;
    case "approval-required":
      handleApprovalRequiredChunk(chunk.approval, adapter);
      break;
    case "approval-resolved":
      adapter.setWorkflowState(workflowStateAfterApprovalResolved(chunk.approved));
      adapter.setStatusText(statusTextForApprovalResolved(chunk.approved));
      break;
    case "workflow-updated":
      handleWorkflowUpdatedChunk(chunk.state, adapter);
      break;
    case "metadata-available":
      adapter.mergeAssistantMetadata(chunk.metadata);
      break;
  }
}

function finishUiChunk(adapter: ChatUiChunkDispatcherAdapter): void {
  adapter.stopStreaming();
  adapter.setUiChunkStreamAvailable(false);
  adapter.setBusy(false);
  adapter.setStatusText(null);
  adapter.clearCancel();
}

function failUiChunk(errorText: string | undefined, adapter: ChatUiChunkDispatcherAdapter): void {
  adapter.stopStreaming();
  adapter.setUiChunkStreamAvailable(false);
  adapter.addErrorBubbleOnce(errorText || "Something went wrong.");
  adapter.setBusy(false);
  adapter.setStatusText(null);
  adapter.clearCancel();
}

function handleApprovalRequiredChunk(
  approvalValue: unknown,
  adapter: ChatUiChunkDispatcherAdapter,
): void {
  if (!isApprovalRequest(approvalValue)) return;
  adapter.setWorkflowState(workflowStateFromApprovalRequired(approvalValue));
  adapter.showApprovalRequest(approvalValue);
  adapter.setStatusText("Waiting for approval");
}

function handleWorkflowUpdatedChunk(
  stateValue: unknown,
  adapter: ChatUiChunkDispatcherAdapter,
): void {
  if (!isWorkflowEventStateOrNull(stateValue)) return;
  adapter.setWorkflowState(stateValue);
  if (stateValue?.pendingApproval && isApprovalRequest(stateValue.pendingApproval)) {
    adapter.showApprovalRequest(stateValue.pendingApproval);
  }
  const statusText = statusTextForWorkflowState(stateValue);
  if (statusText !== undefined) adapter.setStatusText(statusText);
}

function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.riskLevel !== "string") return false;
  if (typeof value.explanation !== "string" || !isRecord(value.action)) return false;
  return typeof value.action.tool === "string"
    && isRecord(value.action.args)
    && typeof value.action.description === "string";
}

function isWorkflowEventStateOrNull(value: unknown): value is WorkflowEventState | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.status === "string"
    && typeof value.currentStep === "string"
    && Array.isArray(value.completedTools);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
