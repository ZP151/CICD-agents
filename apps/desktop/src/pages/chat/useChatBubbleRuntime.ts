import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  cancelPlan,
  confirmPlan,
  type ChatUiChunk,
} from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import { reduceChatBubbles, type ChatBubbleAction } from "./chatBubbleReducer.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import { uid } from "./chatStreamDispatcher.js";
import { dispatchChatUiChunk } from "./chatUiChunkDispatcher.js";

interface AssistantVisibleStreamActions {
  appendAssistantDelta: (delta: string, textPartId?: string) => void;
  startAssistantTextPart: (textPartId: string) => void;
  stopStreaming: (textPartId?: string) => void;
}

interface UseChatBubbleRuntimeArgs extends AssistantVisibleStreamActions {
  cancelRef: MutableRefObject<(() => void) | null>;
  forceNextScrollToBottom: () => void;
  markIncomingContentScrollIntent: () => void;
  sessionId: string | null;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
  uiStreamAvailableRef: MutableRefObject<boolean>;
}

export interface ChatBubbleRuntime {
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  addErrorBubbleOnce: (message: string) => void;
  appendToolOutputDelta: (
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => void;
  finaliseWithResponse: (cleanText: string, meta?: Bubble["meta"], streamedText?: string) => void;
  handleUiChunk: (chunk?: ChatUiChunk) => void;
  mergeAssistantMetadata: (metadata: unknown) => void;
  resolveConfirm: (bubbleId: string, confirmed: boolean) => Promise<void>;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  toggleTool: (id: string) => void;
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

export function useChatBubbleRuntime({
  appendAssistantDelta,
  cancelRef,
  forceNextScrollToBottom,
  markIncomingContentScrollIntent,
  sessionId,
  setBubbles,
  setBusy,
  setStatusText,
  setWorkflowState,
  startAssistantTextPart,
  stopStreaming,
  uiStreamAvailableRef,
}: UseChatBubbleRuntimeArgs): ChatBubbleRuntime {
  const dispatchBubbleAction = useCallback((action: ChatBubbleAction) => {
    setBubbles((prev) => reduceChatBubbles(prev, action, uid));
  }, [setBubbles]);

  const addBubble = useCallback((bubble: Bubble, options?: { forceScroll?: boolean }) => {
    if (options?.forceScroll) forceNextScrollToBottom();
    else markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "add", bubble });
  }, [dispatchBubbleAction, forceNextScrollToBottom, markIncomingContentScrollIntent]);

  const addErrorBubbleOnce = useCallback((message: string) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "add_error_once", message });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const finaliseWithResponse = useCallback((
    cleanText: string,
    meta?: Bubble["meta"],
    streamedText?: string,
  ) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "finalise_response", cleanText, meta, streamedText });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const showApprovalRequest = useCallback((approval: ApprovalRequest) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "show_approval", approval });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const upsertToolBubble = useCallback((
    snapshot: ToolCallPartSnapshot,
    options: {
      ok?: boolean;
      result?: unknown;
      open?: boolean;
      liveOutput?: string;
    } = {},
  ) => {
    if (!snapshot.toolName) return;
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "upsert_tool", snapshot, options });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const appendToolOutputDelta = useCallback((
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => {
    if (!toolName || !delta) return;
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "append_tool_output_delta", toolName, stream, delta, toolCallId });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const mergeAssistantMetadata = useCallback((metadata: unknown) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "merge_assistant_metadata", metadata });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const handleUiChunk = useCallback((chunk?: ChatUiChunk) => {
    dispatchChatUiChunk(chunk, {
      addErrorBubbleOnce,
      appendAssistantDelta,
      appendToolOutputDelta,
      clearCancel: () => {
        cancelRef.current = null;
      },
      mergeAssistantMetadata,
      setBusy,
      setStatusText,
      setUiChunkStreamAvailable: (available) => {
        uiStreamAvailableRef.current = available;
      },
      setWorkflowState,
      showApprovalRequest,
      startAssistantTextPart,
      stopStreaming,
      upsertToolBubble,
    });
  }, [
    addErrorBubbleOnce,
    appendAssistantDelta,
    appendToolOutputDelta,
    cancelRef,
    mergeAssistantMetadata,
    setBusy,
    setStatusText,
    setWorkflowState,
    showApprovalRequest,
    startAssistantTextPart,
    stopStreaming,
    uiStreamAvailableRef,
    upsertToolBubble,
  ]);

  const toggleTool = useCallback((id: string) => {
    dispatchBubbleAction({ type: "toggle_tool", id });
  }, [dispatchBubbleAction]);

  const resolveConfirm = useCallback(
    async (bubbleId: string, confirmed: boolean) => {
      dispatchBubbleAction({ type: "resolve_confirm", id: bubbleId, confirmed });
      if (!sessionId) return;
      if (confirmed) await confirmPlan(sessionId);
      else await cancelPlan(sessionId);
    },
    [dispatchBubbleAction, sessionId],
  );

  return {
    addBubble,
    addErrorBubbleOnce,
    appendToolOutputDelta,
    finaliseWithResponse,
    handleUiChunk,
    mergeAssistantMetadata,
    resolveConfirm,
    showApprovalRequest,
    toggleTool,
    upsertToolBubble,
  };
}
