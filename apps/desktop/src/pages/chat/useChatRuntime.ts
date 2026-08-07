import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  chatStream,
  confirmAction as apiConfirmAction,
  declineAction as apiDeclineAction,
  fetchChatHistory,
  type ChatEventPayload,
  type ChatHistoryEntry,
  type ProjectLink,
} from "../../api.js";
import type { ComposerImageAttachment } from "./chatAttachments.js";
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
import { createOptimisticTurnTranscriptBubble } from "./chatTurnTranscript.js";
import { beginTurnMetrics } from "./chatTurnMetrics.js";

export interface UseChatRuntimeAdapterArgs {
  cancelRef: MutableRefObject<(() => void) | null>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  appendAssistantDelta: (delta: string) => void;
  stopStreaming: () => void;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  sessionId: string | null;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setHistory: Dispatch<SetStateAction<ChatHistoryEntry[]>>;
}

export function useChatRuntimeAdapter(args: UseChatRuntimeAdapterArgs): ChatStreamDispatcherAdapter {
  return useMemo<ChatStreamDispatcherAdapter>(() => ({
    setSessionId: args.setSessionId,
    setStatusText: args.setStatusText,
    appendAssistantDelta: args.appendAssistantDelta,
    stopStreaming: args.stopStreaming,
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
  }), [
    args.addBubble,
    args.appendAssistantDelta,
    args.cancelRef,
    args.finaliseWithResponse,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setHistory,
    args.setSessionId,
    args.setStatusText,
    args.setWorkflowState,
    args.showApprovalRequest,
    args.stopStreaming,
  ]);
}

export interface UseChatRuntimeActionsArgs {
  bubbles: Bubble[];
  busy: boolean;
  sessionId: string | null;
  repoPath: string;
  activeProjectLinkId: string | null;
  activeProjectLink: ProjectLink | null;
  activeModel: ConversationModelChoice;
  activeCustomModel: CustomConversationModel | null;
  mini: boolean;
  chatStreamDispatcherAdapter: ChatStreamDispatcherAdapter;
  cancelRef: MutableRefObject<(() => void) | null>;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  stopStreaming: () => void;
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
}

export interface ChatRuntimeActions {
  sendMessage: (message: string, options?: { silent?: boolean; imageAttachments?: ComposerImageAttachment[] }) => void;
  confirmPendingAction: (bubbleId: string) => void;
  cancelPendingAction: (bubbleId: string, feedback?: string) => void;
  stopCurrentTurn: () => void;
}

export function approvalDenialMessage(feedback?: string): string {
  return feedback?.trim() || "no";
}

const LOCAL_CANCELLED_FINAL =
  "Cancelled by you. The evidence already gathered stays visible; continue the unfinished steps when ready.";

/**
 * A browser abort prevents the daemon from sending its terminal event back to
 * this client. Keep cancellation in the same public Timeline as every other
 * terminal path so a Working transcript cannot be left orphaned. The local
 * terminal carries the same typed kind as the daemon's (MP-011).
 */
export function localTurnCancellationEvents(
  turnId: string,
  lastSequence: number | undefined,
  startedAt: number,
  now = Date.now(),
): ChatEventPayload[] {
  const sequence = (lastSequence ?? 0) + 1;
  const elapsedMs = Math.max(0, now - startedAt);
  return [
    { type: "turn.execution.completed", turnId, sequence, emittedAt: now, elapsedMs },
    { type: "turn.final.delta", turnId, sequence: sequence + 1, emittedAt: now, delta: LOCAL_CANCELLED_FINAL },
    { type: "turn.final.completed", turnId, sequence: sequence + 2, emittedAt: now, finalText: LOCAL_CANCELLED_FINAL },
    {
      type: "turn.cancelled",
      turnId,
      sequence: sequence + 3,
      emittedAt: now,
      elapsedMs,
      status: "cancelled",
      failureKind: "cancelled_by_user",
      recoveryAction: "resume",
      retryable: false,
    },
  ];
}

export function useChatRuntimeActions(args: UseChatRuntimeActionsArgs): ChatRuntimeActions {
  const sendMessage = useCallback((message: string, options?: { silent?: boolean; imageAttachments?: ComposerImageAttachment[] }) => {
    const imageAttachments = options?.imageAttachments ?? [];
    if ((!message && imageAttachments.length === 0) || args.busy) return;
    args.setBusy(true);
    // The optimistic Turn Transcript is the only immediate progress surface.
    // Do not add a second generic "Planning" status beside it.
    args.setStatusText(null);
    const visibleMessage = imageAttachments.length > 0
      ? [message, imageAttachments.map((attachment) => `[image: ${attachment.name}]`).join("\n")].filter(Boolean).join("\n\n")
      : message;
    if (!options?.silent) {
      args.addBubble({
        id: uid(),
        kind: "user",
        text: visibleMessage,
        transientImageAttachments: imageAttachments,
      }, { forceScroll: true });
    }
    const optimisticTurnId = uid();
    const clientTurnId = `local-turn-${optimisticTurnId}`;
    beginTurnMetrics(clientTurnId);
    args.addBubble(createOptimisticTurnTranscriptBubble(optimisticTurnId, visibleMessage), { forceScroll: true });

    const repo = args.repoPath || ".";
    const resolvedModelChoice =
      args.activeModel !== "built_in" && args.activeCustomModel ? args.activeModel : "built_in";
    if (args.activeModel !== "built_in" && !args.activeCustomModel) {
      args.setStatusText(`Selected model is no longer configured, using ${DEFAULT_CONVERSATION_MODEL_LABEL}.`);
    }

    let resolvedSessionId = args.sessionId;

    let acceptsEvents = true;
    const { cancel } = chatStream(
      message,
      repo,
      args.sessionId,
      (event: ChatEventPayload) => {
        if (!acceptsEvents) return;
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
      imageAttachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl,
      })),
      args.activeProjectLink,
      clientTurnId,
    );
    args.cancelRef.current = () => {
      acceptsEvents = false;
      cancel();
    };
  }, [
    args.activeCustomModel,
    args.activeModel,
    args.activeProjectLink,
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
  ]);

  const confirmPendingAction = useCallback((bubbleId: string) => {
    if (!args.sessionId || args.busy) return;
    const pending = args.bubbles.find((bubble) => bubble.id === bubbleId);
    const activeTranscript = pending?.turnId
      ? args.bubbles.find((bubble) => bubble.turnId === pending.turnId && bubble.turnTranscript)
      : undefined;
    const continuation = activeTranscript?.turnTranscript && pending?.turnId
      ? {
          turnId: pending.turnId,
          startedAt: activeTranscript.turnTranscript.startedAt,
          lastSequence: activeTranscript.turnTranscript.lastSequence,
        }
      : undefined;
    args.setBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_status",
      id: bubbleId,
      status: "executing",
    }, uid));
    args.setBusy(true);
    args.setStatusText("Executing");

    const { cancel } = apiConfirmAction(args.sessionId, (event: ChatEventPayload) => {
      dispatchChatStreamEvent(event, args.chatStreamDispatcherAdapter, {
        pendingBubbleId: bubbleId,
        refreshHistoryOnDone: !args.mini,
      });
    }, continuation);
    args.cancelRef.current = cancel;
  }, [
    args.bubbles,
    args.busy,
    args.cancelRef,
    args.chatStreamDispatcherAdapter,
    args.mini,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setStatusText,
  ]);

  const cancelPendingAction = useCallback((bubbleId: string, feedback?: string) => {
    if (!args.sessionId || args.busy) return;
    const pending = args.bubbles.find((bubble) => bubble.id === bubbleId);
    const activeTranscript = pending?.turnId
      ? args.bubbles.find((bubble) => bubble.turnId === pending.turnId && bubble.turnTranscript)
      : undefined;
    // Workspace-originated approvals have no chat Turn (no turnId); declining
    // them still reaches the daemon, which gives the decline its own envelope.
    const continuation = pending?.turnId && activeTranscript?.turnTranscript
      ? {
          turnId: pending.turnId,
          startedAt: activeTranscript.turnTranscript.startedAt,
          lastSequence: activeTranscript.turnTranscript.lastSequence,
        }
      : undefined;
    args.setBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_status",
      id: bubbleId,
      status: "cancelled",
    }, uid));
    args.setBusy(true);
    args.setStatusText("Finalizing");

    const { cancel } = apiDeclineAction(args.sessionId, (event: ChatEventPayload) => {
      dispatchChatStreamEvent(event, args.chatStreamDispatcherAdapter, {
        pendingBubbleId: bubbleId,
        refreshHistoryOnDone: !args.mini,
      });
    }, continuation);
    args.cancelRef.current = cancel;
  }, [
    args.bubbles,
    args.busy,
    args.cancelRef,
    args.chatStreamDispatcherAdapter,
    args.mini,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setStatusText,
  ]);

  const stopCurrentTurn = useCallback(() => {
    const activeBubble = [...args.bubbles].reverse().find((bubble) => (
      bubble.turnId
      && bubble.turnTranscript
      && (bubble.turnTranscript.status === "working" || bubble.turnTranscript.status === "sealed")
    ));
    if (activeBubble?.turnId && activeBubble.turnTranscript) {
      for (const event of localTurnCancellationEvents(
        activeBubble.turnId,
        activeBubble.turnTranscript.lastSequence,
        activeBubble.turnTranscript.startedAt,
      )) {
        dispatchChatStreamEvent(event, args.chatStreamDispatcherAdapter, {
          refreshHistoryOnDone: !args.mini,
        });
      }
    }
    args.cancelRef.current?.();
    args.cancelRef.current = null;
  }, [
    args.bubbles,
    args.cancelRef,
    args.chatStreamDispatcherAdapter,
    args.mini,
  ]);

  return useMemo(() => ({
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    stopCurrentTurn,
  }), [cancelPendingAction, confirmPendingAction, sendMessage, stopCurrentTurn]);
}
