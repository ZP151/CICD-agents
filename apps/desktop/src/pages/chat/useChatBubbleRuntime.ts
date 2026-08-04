import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  cancelPlan,
  confirmPlan,
} from "../../api.js";
import { reduceChatBubbles, type ChatBubbleAction } from "./chatBubbleReducer.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import { uid } from "./chatStreamDispatcher.js";

interface UseChatBubbleRuntimeArgs {
  cancelRef: MutableRefObject<(() => void) | null>;
  forceNextScrollToBottom: () => void;
  markIncomingContentScrollIntent: () => void;
  sessionId: string | null;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
}

export interface ChatBubbleRuntime {
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  finaliseWithResponse: (cleanText: string, meta?: Bubble["meta"], streamedText?: string) => void;
  resolveConfirm: (bubbleId: string, confirmed: boolean) => Promise<void>;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  toggleTool: (id: string) => void;
}

export function useChatBubbleRuntime({
  cancelRef,
  forceNextScrollToBottom,
  markIncomingContentScrollIntent,
  sessionId,
  setBubbles,
  setBusy,
  setStatusText,
  setWorkflowState,
}: UseChatBubbleRuntimeArgs): ChatBubbleRuntime {
  const dispatchBubbleAction = useCallback((action: ChatBubbleAction) => {
    setBubbles((prev) => reduceChatBubbles(prev, action, uid));
  }, [setBubbles]);

  const addBubble = useCallback((bubble: Bubble, options?: { forceScroll?: boolean }) => {
    if (options?.forceScroll) forceNextScrollToBottom();
    else markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "add", bubble });
  }, [dispatchBubbleAction, forceNextScrollToBottom, markIncomingContentScrollIntent]);

  const finaliseWithResponse = useCallback((
    cleanText: string,
    meta?: Bubble["meta"],
    streamedText?: string,
  ) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "finalise_response", cleanText, meta, streamedText });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

  const showApprovalRequest = useCallback((approval: ApprovalRequest, turnId?: string) => {
    markIncomingContentScrollIntent();
    dispatchBubbleAction({ type: "show_approval", approval, turnId });
  }, [dispatchBubbleAction, markIncomingContentScrollIntent]);

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
    finaliseWithResponse,
    resolveConfirm,
    showApprovalRequest,
    toggleTool,
  };
}
