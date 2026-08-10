import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  ChatHistoryEntry,
  ProjectLink,
} from "../../api.js";
import type { ComposerInputState } from "../../components/conversation/SuggestionReplyBar.js";
import type {
  ConversationModelChoice,
  CustomConversationModel,
} from "./chatModelSelection.js";
import type {
  ApprovalRequest,
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";
import { useAssistantVisibleStream } from "./useAssistantVisibleStream.js";
import type { ComposerImageAttachment } from "./chatAttachments.js";
import { canSendComposerTurn } from "./chatComposerSendState.js";
import { useChatBubbleRuntime } from "./useChatBubbleRuntime.js";
import { useChatRuntimeActions, useChatRuntimeAdapter } from "./useChatRuntime.js";
import { useChatSessionLifecycle } from "./useChatSessionLifecycle.js";

interface UseChatTurnRuntimeArgs {
  activeCustomModel: CustomConversationModel | null;
  activeModel: ConversationModelChoice;
  activeProjectLinkId: string | null;
  activeProjectLink: ProjectLink | null;
  bubbles: Bubble[];
  busy: boolean;
  cancelRef: MutableRefObject<(() => void) | null>;
  composerInputState: ComposerInputState;
  customTitle: string | null;
  forceNextScrollToBottom: () => void;
  history: ChatHistoryEntry[];
  input: string;
  pendingAutoSubmitMessage: string | null;
  locationSearch: string;
  markIncomingContentScrollIntent: () => void;
  mini: boolean;
  navigateToChat: () => void;
  newChat: () => void;
  repoPath: string;
  sessionId: string | null;
  statusText: string | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
  workflowState: WorkflowEventState | null;
  setActiveProjectLinkId: (id: string | null) => void;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setCustomTitle: (title: string | null) => void;
  setHistory: Dispatch<SetStateAction<ChatHistoryEntry[]>>;
  setHistoryOpen: (open: boolean) => void;
  setInput: (value: string) => void;
  setPendingAutoSubmitMessage: (value: string | null) => void;
  setRepoPath: (value: string) => void;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  setTitleEditing: Dispatch<SetStateAction<boolean>>;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
}

export interface ChatTurnRuntime {
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  cancelPendingAction: (id: string, feedback?: string) => void;
  confirmPendingAction: (id: string) => void;
  loadSession: (sessionId: string) => Promise<void>;
  resolveConfirm: (id: string, confirmed: boolean) => Promise<void>;
  send: (options?: { message?: string; imageAttachments?: ComposerImageAttachment[] }) => void;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  stopCurrentTurn: () => void;
  toggleTool: (id: string) => void;
}

export function useChatTurnRuntime({
  activeCustomModel,
  activeModel,
  activeProjectLinkId,
  activeProjectLink,
  bubbles,
  busy,
  cancelRef,
  composerInputState,
  customTitle,
  forceNextScrollToBottom,
  history,
  input,
  pendingAutoSubmitMessage,
  locationSearch,
  markIncomingContentScrollIntent,
  mini,
  navigateToChat,
  newChat,
  repoPath,
  sessionId,
  statusText,
  textareaRef,
  workflowState,
  setActiveProjectLinkId,
  setBubbles,
  setBusy,
  setCustomTitle,
  setHistory,
  setHistoryOpen,
  setInput,
  setPendingAutoSubmitMessage,
  setRepoPath,
  setSessionId,
  setStatusText,
  setTitleEditing,
  setWorkflowState,
}: UseChatTurnRuntimeArgs): ChatTurnRuntime {
  const {
    appendAssistantDelta,
    startAssistantTextPart,
    stopStreaming,
  } = useAssistantVisibleStream({
    markIncomingContentScrollIntent,
    setBubbles,
  });

  const {
    addBubble,
    finaliseWithResponse,
    resolveConfirm,
    showApprovalRequest,
    toggleTool,
  } = useChatBubbleRuntime({
    cancelRef,
    forceNextScrollToBottom,
    markIncomingContentScrollIntent,
    sessionId,
    setBubbles,
    setBusy,
    setStatusText,
    setWorkflowState,
  });

  const { loadSession } = useChatSessionLifecycle({
    activeProjectLinkId,
    bubbles,
    customTitle,
    history,
    input,
    locationSearch,
    mini,
    navigateToChat,
    newChat,
    repoPath,
    sessionId,
    statusText,
    textareaRef,
    workflowState,
    forceNextScrollToBottom,
    setActiveProjectLinkId,
    setBubbles,
    setCustomTitle,
    setHistoryOpen,
    setInput,
    setPendingAutoSubmitMessage,
    setRepoPath,
    setSessionId,
    setStatusText,
    setTitleEditing,
    setWorkflowState,
    showApprovalRequest,
  });

  const chatStreamDispatcherAdapter = useChatRuntimeAdapter({
    cancelRef,
    setSessionId,
    setStatusText,
    appendAssistantDelta,
    stopStreaming,
    setBubbles,
    addBubble,
    sessionId,
    setWorkflowState,
    showApprovalRequest,
    finaliseWithResponse,
    setBusy,
    setHistory,
  });

  const {
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    stopCurrentTurn,
  } = useChatRuntimeActions({
    bubbles,
    busy,
    sessionId,
    repoPath,
    activeProjectLinkId,
    activeProjectLink,
    activeModel,
    activeCustomModel,
    mini,
    chatStreamDispatcherAdapter,
    cancelRef,
    setBubbles,
    setBusy,
    setStatusText,
    stopStreaming,
    addBubble,
  });

  const send = useCallback((options?: { message?: string; imageAttachments?: ComposerImageAttachment[] }) => {
    const msg = (options?.message ?? input).trim();
    const imageAttachments = options?.imageAttachments ?? [];
    if (!canSendComposerTurn({
      controlsDisabled: composerInputState.controlsDisabled,
      sendDisabled: composerInputState.sendDisabled,
      message: msg,
      imageAttachmentCount: imageAttachments.length,
    })) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    sendMessage(msg, { imageAttachments });
  }, [composerInputState.controlsDisabled, composerInputState.sendDisabled, input, sendMessage, setInput, textareaRef]);

  // A source control labelled “Analyze” has already requested a read-only
  // inspection. Wait until its Project Link context is committed, then send
  // exactly one streamed turn instead of leaving a second Send click behind.
  useEffect(() => {
    if (!pendingAutoSubmitMessage || !activeProjectLinkId) return;
    setPendingAutoSubmitMessage(null);
    send({ message: pendingAutoSubmitMessage });
  }, [activeProjectLinkId, pendingAutoSubmitMessage, send, setPendingAutoSubmitMessage]);

  return {
    addBubble,
    cancelPendingAction,
    confirmPendingAction,
    loadSession,
    resolveConfirm,
    send,
    showApprovalRequest,
    stopCurrentTurn,
    toggleTool,
  };
}
