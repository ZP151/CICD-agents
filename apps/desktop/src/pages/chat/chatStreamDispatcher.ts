import type { ChatEventPayload, ChatUiChunk } from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import { reduceChatEvent } from "./chatEventReducer.js";
import {
  makeToolCallId,
} from "./chatToolStreamState.js";
import {
  handleCancelledEvent,
  handleDoneEvent,
  handleErrorEvent,
} from "./chatTerminalStreamState.js";
import {
  statusTextForApprovalResolved,
  statusTextForWorkflowState,
  workflowStateAfterApprovalResolved,
  workflowStateFromApprovalRequired,
  type WorkflowStateUpdate,
} from "./chatWorkflowStreamState.js";

export interface ChatStreamDispatchOptions {
  onSession?: (sessionId: string) => void;
  confirmSessionId?: string | null;
  pendingBubbleId?: string;
  refreshHistoryOnDone?: boolean;
}

export interface ChatStreamDispatcherAdapter {
  uiChunkStreamAvailable: () => boolean;
  setUiChunkStreamAvailable: (available: boolean) => void;
  handleUiChunk: (chunk?: ChatUiChunk) => void;
  setSessionId: (sessionId: string) => void;
  setStatusText: (status: string | null) => void;
  appendAssistantDelta: (delta: string) => void;
  stopStreaming: () => void;
  upsertToolBubble: (snapshot: ToolCallPartSnapshot) => void;
  appendToolOutputDelta: (
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => void;
  updateBubbles: (updater: (prev: Bubble[]) => Bubble[]) => void;
  addBubble: (bubble: Bubble) => void;
  currentSessionId: () => string | null;
  setWorkflowState: (update: WorkflowStateUpdate) => void;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: (busy: boolean) => void;
  clearCancel: () => void;
  refreshHistory: () => void;
  addErrorBubbleOnce: (text: string) => void;
}

export function dispatchChatStreamEvent(
  ev: ChatEventPayload,
  adapter: ChatStreamDispatcherAdapter,
  options: ChatStreamDispatchOptions = {},
): void {
  const eventReduction = reduceChatEvent(
    { uiChunkStreamAvailable: adapter.uiChunkStreamAvailable() },
    ev,
  );
  if (eventReduction.acceptance.kind === "ignored") {
    adapter.setUiChunkStreamAvailable(eventReduction.nextState.uiChunkStreamAvailable);
    return;
  }

  switch (ev.type) {
    case "ui.chunk":
      adapter.handleUiChunk(ev.uiChunk);
      break;

    case "session":
      if (ev.sessionId) {
        options.onSession?.(ev.sessionId);
        adapter.setSessionId(ev.sessionId);
      }
      break;

    case "assistant_delta":
      adapter.setStatusText(null);
      adapter.appendAssistantDelta(ev.delta ?? "");
      break;

    case "progress":
      adapter.stopStreaming();
      adapter.setStatusText(ev.message ?? "Working");
      break;

    case "tool_start": {
      adapter.setStatusText(`Running ${ev.name}`);
      adapter.stopStreaming();
      const toolName = ev.name ?? "unknown";
      const toolCallId = ev.toolCallId ?? makeToolCallId(toolName, ev.args);
      adapter.upsertToolBubble({
        toolCallId,
        toolName,
        state: "input-available",
        input: ev.args,
      });
      break;
    }

    case "tool_output_delta":
    case "tool.output.delta":
      adapter.appendToolOutputDelta(ev.name, ev.stream, ev.delta, ev.toolCallId);
      break;

    case "tool_end":
      adapter.updateBubbles((prev) => reduceChatBubbles(prev, { type: "tool_end", event: ev }, uid));
      if (options.pendingBubbleId) {
        adapter.updateBubbles((prev) => reduceChatBubbles(prev, {
          type: "mark_pending_done",
          id: options.pendingBubbleId,
        }, uid));
      }
      adapter.setStatusText("Processing");
      break;

    case "confirm_required":
      adapter.stopStreaming();
      adapter.addBubble({
        id: uid(),
        kind: "confirm",
        riskLevel: ev.riskLevel,
        plan: ev.plan,
        sessionId: options.confirmSessionId ?? adapter.currentSessionId() ?? undefined,
        confirmed: null,
      });
      adapter.setStatusText("Waiting for confirmation");
      break;

    case "workflow_state":
      adapter.setWorkflowState(ev.state ?? null);
      if (ev.state?.pendingApproval) adapter.showApprovalRequest(ev.state.pendingApproval);
      {
        const statusText = statusTextForWorkflowState(ev.state);
        if (statusText !== undefined) adapter.setStatusText(statusText);
      }
      if (ev.state?.pendingApproval) pauseForApproval(adapter);
      break;

    case "approval_required":
      if (ev.approval) {
        adapter.setWorkflowState(workflowStateFromApprovalRequired(ev.approval));
        adapter.showApprovalRequest(ev.approval);
      }
      adapter.setStatusText("Waiting for approval");
      pauseForApproval(adapter);
      break;

    case "approval_resolved":
      adapter.setWorkflowState(workflowStateAfterApprovalResolved(ev.approved));
      adapter.setStatusText(statusTextForApprovalResolved(ev.approved));
      break;

    case "executing":
      adapter.addBubble({ id: uid(), kind: "system", text: "Executing actions..." });
      adapter.setStatusText("Executing");
      break;

    case "message":
      if (ev.text) {
        adapter.stopStreaming();
        adapter.addBubble({ id: uid(), kind: "assistant", text: ev.text });
      }
      break;

    case "done":
      handleDoneEvent(ev, adapter, {
        refreshHistoryOnDone: options.refreshHistoryOnDone,
      });
      break;

    case "cancelled":
      handleCancelledEvent(adapter, {
        pendingBubbleId: options.pendingBubbleId,
        makeId: uid,
      });
      break;

    case "error":
      handleErrorEvent(ev, adapter, {
        pendingBubbleId: options.pendingBubbleId,
      });
      break;
  }

  adapter.setUiChunkStreamAvailable(eventReduction.nextState.uiChunkStreamAvailable);
}

function pauseForApproval(adapter: ChatStreamDispatcherAdapter): void {
  adapter.setBusy(false);
  adapter.clearCancel();
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
