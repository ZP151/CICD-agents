import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  fetchChatMessages,
  fetchChatState,
  type ChatHistoryEntry,
} from "../../api.js";
import {
  chatMessagesToBubbles,
} from "./chatSessionHistory.js";
import {
  saveChatDraft,
} from "./chatDraftPersistence.js";
import { APPROVAL_HANDOFF_STATUS_TEXT, consumeApprovalHandoff } from "./approvalHandoff.js";
import { consumeChatHandoff } from "./chatHandoff.js";
import type {
  ApprovalRequest,
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";

interface UseChatSessionLifecycleArgs {
  activeProjectLinkId: string | null;
  bubbles: Bubble[];
  customTitle: string | null;
  history: ChatHistoryEntry[];
  input: string;
  locationSearch: string;
  mini: boolean;
  navigateToChat: () => void;
  newChat: () => void;
  repoPath: string;
  sessionId: string | null;
  statusText: string | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
  workflowState: WorkflowEventState | null;
  forceNextScrollToBottom: () => void;
  setActiveProjectLinkId: (id: string | null) => void;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setCustomTitle: (title: string | null) => void;
  setHistoryOpen: (open: boolean) => void;
  setInput: (value: string) => void;
  setRepoPath: (value: string) => void;
  setSessionId: (id: string | null) => void;
  setStatusText: (text: string | null) => void;
  setTitleEditing: (editing: boolean) => void;
  setWorkflowState: (state: WorkflowEventState | null) => void;
  showApprovalRequest: (approval: ApprovalRequest) => void;
}

export interface ChatSessionLifecycle {
  loadSession: (sessionId: string) => Promise<void>;
}

export function useChatSessionLifecycle({
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
  setRepoPath,
  setSessionId,
  setStatusText,
  setTitleEditing,
  setWorkflowState,
  showApprovalRequest,
}: UseChatSessionLifecycleArgs): ChatSessionLifecycle {
  useEffect(() => {
    // MP-006: a Pipelines page trigger hands off its live approval session.
    // Consume it before the generic chat handoff so the pending card (and its
    // daemon-side proposal) rehydrates instead of being discarded.
    const approvalHandoff = consumeApprovalHandoff();
    if (approvalHandoff) {
      setSessionId(approvalHandoff.sessionId);
      setBubbles([]);
      setWorkflowState(approvalHandoff.workflowState);
      // The pending-action card is a bubble, not a workflowState projection:
      // rehydrate it from the handoff exactly like loadSession rehydrates a
      // stored session, so "Open Chat approval" lands on a live card.
      if (approvalHandoff.workflowState.pendingApproval) {
        showApprovalRequest(approvalHandoff.workflowState.pendingApproval);
      }
      setCustomTitle(null);
      setInput("");
      if (approvalHandoff.repoPath) setRepoPath(approvalHandoff.repoPath);
      if (approvalHandoff.activeProjectLinkId) {
        setActiveProjectLinkId(approvalHandoff.activeProjectLinkId);
      }
      setStatusText(APPROVAL_HANDOFF_STATUS_TEXT);
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    const handoff = consumeChatHandoff();
    if (!handoff) return;
    setSessionId(null);
    setBubbles([]);
    setWorkflowState(null);
    setCustomTitle(null);
    setInput(handoff.input);
    if (handoff.repoPath) setRepoPath(handoff.repoPath);
    if (handoff.activeProjectLinkId) setActiveProjectLinkId(handoff.activeProjectLinkId);
    setStatusText(handoff.statusText);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [
    setActiveProjectLinkId,
    setBubbles,
    setCustomTitle,
    setInput,
    setRepoPath,
    setSessionId,
    setStatusText,
    setWorkflowState,
    showApprovalRequest,
    textareaRef,
  ]);

  useEffect(() => {
    localStorage.setItem("chat_repo", repoPath);
  }, [repoPath]);

  useEffect(() => {
    if (mini) return;
    saveChatDraft({
      repoPath,
      input,
      bubbles,
      sessionId,
      statusText,
      workflowState,
      customTitle,
      activeProjectLinkId,
    });
  }, [activeProjectLinkId, bubbles, customTitle, input, mini, repoPath, sessionId, statusText, workflowState]);

  useEffect(() => {
    if (mini) return;
    const params = new URLSearchParams(locationSearch);
    if (params.get("new") !== "1") return;
    newChat();
    navigateToChat();
  }, [locationSearch, mini, navigateToChat, newChat]);

  const loadSession = useCallback(async (targetSessionId: string) => {
    const historyEntry = history.find((item) => item.sessionId === targetSessionId);
    try {
      const [stored, state] = await Promise.all([
        fetchChatMessages(targetSessionId),
        fetchChatState(targetSessionId).catch(() => ({ workflowState: undefined })),
      ]);
      setSessionId(targetSessionId);
      setCustomTitle(historyEntry?.title ?? null);
      setTitleEditing(false);
      forceNextScrollToBottom();
      setBubbles(chatMessagesToBubbles(stored));
      setWorkflowState(state.workflowState ?? null);
      if (state.workflowState?.pendingApproval) {
        showApprovalRequest(state.workflowState.pendingApproval);
      }
      setHistoryOpen(false);
    } catch {
      /* ignore */
    }
  }, [
    forceNextScrollToBottom,
    history,
    setBubbles,
    setCustomTitle,
    setHistoryOpen,
    setSessionId,
    setTitleEditing,
    setWorkflowState,
    showApprovalRequest,
  ]);

  return { loadSession };
}
