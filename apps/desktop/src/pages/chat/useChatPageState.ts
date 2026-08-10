import {
  useCallback,
  useRef,
  useState,
} from "react";
import type { SuggestionReply } from "../../components/conversation/SuggestionReplyBar.js";
import {
  clearChatDraft,
  loadChatDraft,
  type ChatDraftState,
} from "./chatDraftPersistence.js";
import type {
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";
import type { WorkspaceContextSnapshot } from "./workspaceContextSnapshot.js";

export function useChatPageState(locationSearch: string) {
  const initialDraftRef = useRef<ChatDraftState | null>(null);
  if (initialDraftRef.current === null) {
    const explicitNewChat = new URLSearchParams(locationSearch).get("new") === "1";
    initialDraftRef.current = !explicitNewChat && typeof window !== "undefined" ? loadChatDraft() : null;
  }
  const initialDraft = initialDraftRef.current;
  const [repoPath, setRepoPath] = useState(
    initialDraft?.repoPath ?? (typeof window !== "undefined" ? (localStorage.getItem("chat_repo") ?? "") : ""),
  );
  const [input, setInput] = useState(initialDraft?.input ?? "");
  const [pendingAutoSubmitMessage, setPendingAutoSubmitMessage] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>(initialDraft?.bubbles ?? []);
  const [sessionId, setSessionId] = useState<string | null>(initialDraft?.sessionId ?? null);
  const [busy, setBusy] = useState(false);
  const [queuedSuggestion, setQueuedSuggestion] = useState<SuggestionReply | null>(null);
  const [statusText, setStatusText] = useState<string | null>(initialDraft?.statusText ?? null);
  const [workflowState, setWorkflowState] = useState<WorkflowEventState | null>(initialDraft?.workflowState ?? null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextSnapshot | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState<string | null>(initialDraft?.customTitle ?? null);
  const cancelRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const newChat = useCallback(() => {
    clearChatDraft();
    setSessionId(null);
    setBubbles([]);
    setInput("");
    setPendingAutoSubmitMessage(null);
    setQueuedSuggestion(null);
    cancelRef.current?.();
    setBusy(false);
    setStatusText(null);
    setWorkflowState(null);
    setWorkspaceContext(null);
    setCustomTitle(null);
    setTitleEditing(false);
  }, []);

  return {
    bubbles,
    busy,
    cancelRef,
    customTitle,
    initialDraft,
    input,
    newChat,
    pendingAutoSubmitMessage,
    queuedSuggestion,
    repoPath,
    sessionId,
    setBubbles,
    setBusy,
    setCustomTitle,
    setInput,
    setPendingAutoSubmitMessage,
    setQueuedSuggestion,
    setRepoPath,
    setSessionId,
    setStatusText,
    setTitleEditing,
    setWorkflowState,
    setWorkspaceContext,
    statusText,
    textareaRef,
    titleEditing,
    titleInputRef,
    workflowState,
    workspaceContext,
  };
}
