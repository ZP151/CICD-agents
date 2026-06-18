import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  shouldQueueSuggestionReply,
  type SuggestionReply,
} from "../../components/conversation/SuggestionReplyBar.js";
import { workspaceActionFromSuggestion } from "./workspaceActionSuggestions.js";
import type { WorkspaceAction } from "./workflowTaskState.js";

interface UseChatSuggestionRuntimeArgs {
  busy: boolean;
  focusComposer: () => void;
  queuedSuggestion: SuggestionReply | null;
  runWorkspaceAction: (action: WorkspaceAction) => void;
  setInput: Dispatch<SetStateAction<string>>;
  setQueuedSuggestion: Dispatch<SetStateAction<SuggestionReply | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  workflowStatus?: string;
}

export interface ChatSuggestionRuntime {
  cancelQueuedSuggestion: () => void;
  handleSuggestionReply: (suggestion: SuggestionReply) => void;
  queuePrompt: (prompt: string) => void;
}

export function useChatSuggestionRuntime({
  busy,
  focusComposer,
  queuedSuggestion,
  runWorkspaceAction,
  setInput,
  setQueuedSuggestion,
  setStatusText,
  workflowStatus,
}: UseChatSuggestionRuntimeArgs): ChatSuggestionRuntime {
  const queuePrompt = useCallback((prompt: string) => {
    setInput(prompt);
    focusComposer();
  }, [focusComposer, setInput]);

  const handleSuggestionReply = useCallback((suggestion: SuggestionReply) => {
    if (shouldQueueSuggestionReply({ busy, workflowStatus })) {
      setQueuedSuggestion(suggestion);
      setStatusText(`Queued follow-up: ${suggestion.label}`);
      return;
    }
    const action = workspaceActionFromSuggestion(suggestion);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(suggestion.message);
  }, [busy, queuePrompt, runWorkspaceAction, setStatusText, workflowStatus]);

  useEffect(() => {
    if (!queuedSuggestion) return;
    if (shouldQueueSuggestionReply({ busy, workflowStatus })) return;
    const next = queuedSuggestion;
    setQueuedSuggestion(null);
    const action = workspaceActionFromSuggestion(next);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(next.message);
    setStatusText(null);
  }, [busy, queuePrompt, queuedSuggestion, runWorkspaceAction, setStatusText, workflowStatus]);

  const cancelQueuedSuggestion = useCallback(() => {
    setQueuedSuggestion(null);
    setStatusText(null);
  }, [setStatusText]);

  return {
    cancelQueuedSuggestion,
    handleSuggestionReply,
    queuePrompt,
  };
}
