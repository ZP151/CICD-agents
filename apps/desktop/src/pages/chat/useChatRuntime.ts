import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  chatStream,
  confirmAction as apiConfirmAction,
  fetchChatHistory,
  type ChatEventPayload,
  type ChatHistoryEntry,
  type ChatUiChunk,
} from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import {
  dispatchChatStreamEvent,
  uid,
  type ChatStreamDispatcherAdapter,
} from "./chatStreamDispatcher.js";
import {
  DEFAULT_CONVERSATION_MODEL_LABEL,
  type ConversationModelChoice,
  type CustomConversationModel,
} from "./chatModelSelection.js";

export interface UseChatRuntimeAdapterArgs {
  uiStreamAvailableRef: MutableRefObject<boolean>;
  cancelRef: MutableRefObject<(() => void) | null>;
  handleUiChunk: (chunk?: ChatUiChunk) => void;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  appendAssistantDelta: (delta: string) => void;
  stopStreaming: () => void;
  upsertToolBubble: (snapshot: ToolCallPartSnapshot) => void;
  appendToolOutputDelta: (
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => void;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  sessionId: string | null;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setHistory: Dispatch<SetStateAction<ChatHistoryEntry[]>>;
  addErrorBubbleOnce: (text: string) => void;
}

export function useChatRuntimeAdapter(args: UseChatRuntimeAdapterArgs): ChatStreamDispatcherAdapter {
  return useMemo<ChatStreamDispatcherAdapter>(() => ({
    uiChunkStreamAvailable: () => args.uiStreamAvailableRef.current,
    setUiChunkStreamAvailable: (available) => {
      args.uiStreamAvailableRef.current = available;
    },
    handleUiChunk: args.handleUiChunk,
    setSessionId: args.setSessionId,
    setStatusText: args.setStatusText,
    appendAssistantDelta: args.appendAssistantDelta,
    stopStreaming: args.stopStreaming,
    upsertToolBubble: args.upsertToolBubble,
    appendToolOutputDelta: args.appendToolOutputDelta,
    updateBubbles: args.setBubbles,
    addBubble: args.addBubble,
    currentSessionId: () => args.sessionId,
    setWorkflowState: args.setWorkflowState,
    showApprovalRequest: args.showApprovalRequest,
    finaliseWithResponse: args.finaliseWithResponse,
    setBusy: args.setBusy,
    clearCancel: () => {
      args.cancelRef.current = null;
    },
    refreshHistory: () => {
      fetchChatHistory().then(args.setHistory).catch(() => undefined);
    },
    addErrorBubbleOnce: args.addErrorBubbleOnce,
  }), [
    args.addBubble,
    args.addErrorBubbleOnce,
    args.appendAssistantDelta,
    args.appendToolOutputDelta,
    args.cancelRef,
    args.finaliseWithResponse,
    args.handleUiChunk,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setHistory,
    args.setSessionId,
    args.setStatusText,
    args.setWorkflowState,
    args.showApprovalRequest,
    args.stopStreaming,
    args.uiStreamAvailableRef,
    args.upsertToolBubble,
  ]);
}

export interface UseChatRuntimeActionsArgs {
  busy: boolean;
  sessionId: string | null;
  repoPath: string;
  activeProjectLinkId: string | null;
  activeModel: ConversationModelChoice;
  activeCustomModel: CustomConversationModel | null;
  mini: boolean;
  chatStreamDispatcherAdapter: ChatStreamDispatcherAdapter;
  uiStreamAvailableRef: MutableRefObject<boolean>;
  cancelRef: MutableRefObject<(() => void) | null>;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  stopStreaming: () => void;
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
}

export interface ChatRuntimeActions {
  sendMessage: (message: string, options?: { silent?: boolean }) => void;
  confirmPendingAction: (bubbleId: string) => void;
  cancelPendingAction: (bubbleId: string) => void;
  stopCurrentTurn: () => void;
}

export function useChatRuntimeActions(args: UseChatRuntimeActionsArgs): ChatRuntimeActions {
  const sendMessage = useCallback((message: string, options?: { silent?: boolean }) => {
    if (!message || args.busy) return;
    args.setBusy(true);
    args.setStatusText("Planning");
    if (!options?.silent) {
      args.addBubble({ id: uid(), kind: "user", text: message }, { forceScroll: true });
    }

    const repo = args.repoPath || ".";
    const resolvedModelChoice =
      args.activeModel !== "built_in" && args.activeCustomModel ? args.activeModel : "built_in";
    if (args.activeModel !== "built_in" && !args.activeCustomModel) {
      args.setStatusText(`Selected model is no longer configured, using ${DEFAULT_CONVERSATION_MODEL_LABEL}.`);
    }

    let resolvedSessionId = args.sessionId;
    args.uiStreamAvailableRef.current = false;

    const { cancel } = chatStream(
      message,
      repo,
      args.sessionId,
      (event: ChatEventPayload) => {
        dispatchChatStreamEvent(event, args.chatStreamDispatcherAdapter, {
          onSession: (nextSessionId) => {
            resolvedSessionId = nextSessionId;
          },
          confirmSessionId: resolvedSessionId,
          refreshHistoryOnDone: !args.mini,
        });
      },
      args.activeProjectLinkId ?? undefined,
      resolvedModelChoice,
    );
    args.cancelRef.current = cancel;
  }, [
    args.activeCustomModel,
    args.activeModel,
    args.activeProjectLinkId,
    args.addBubble,
    args.busy,
    args.cancelRef,
    args.chatStreamDispatcherAdapter,
    args.mini,
    args.repoPath,
    args.sessionId,
    args.setBusy,
    args.setStatusText,
    args.uiStreamAvailableRef,
  ]);

  const confirmPendingAction = useCallback((bubbleId: string) => {
    if (!args.sessionId || args.busy) return;
    args.setBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_status",
      id: bubbleId,
      status: "executing",
    }, uid));
    args.setBusy(true);
    args.setStatusText("Executing");
    args.uiStreamAvailableRef.current = false;

    const { cancel } = apiConfirmAction(args.sessionId, (event: ChatEventPayload) => {
      dispatchChatStreamEvent(event, args.chatStreamDispatcherAdapter, {
        pendingBubbleId: bubbleId,
        refreshHistoryOnDone: !args.mini,
      });
    });
    args.cancelRef.current = cancel;
  }, [
    args.busy,
    args.cancelRef,
    args.chatStreamDispatcherAdapter,
    args.mini,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setStatusText,
    args.uiStreamAvailableRef,
  ]);

  const cancelPendingAction = useCallback((bubbleId: string) => {
    args.setBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_status",
      id: bubbleId,
      status: "cancelled",
    }, uid));
    sendMessage("no");
  }, [args.setBubbles, sendMessage]);

  const stopCurrentTurn = useCallback(() => {
    args.cancelRef.current?.();
    args.cancelRef.current = null;
    args.stopStreaming();
    args.uiStreamAvailableRef.current = false;
    args.setBusy(false);
    args.setStatusText(null);
  }, [
    args.cancelRef,
    args.setBusy,
    args.setStatusText,
    args.stopStreaming,
    args.uiStreamAvailableRef,
  ]);

  return useMemo(() => ({
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    stopCurrentTurn,
  }), [cancelPendingAction, confirmPendingAction, sendMessage, stopCurrentTurn]);
}
