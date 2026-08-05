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

interface UseChatSuggestionRuntimeArgs {
  busy: boolean;
  focusComposer: () => void;
  queuedSuggestion: SuggestionReply | null;
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

/**
 * V2 Project Links never persist pipeline fields, so project_link_update
 * suggestions are no longer generated or executed; the mode remains typed for
 * the shared suggestion action kind.
 */
export function suggestionReplyExecutionMode(suggestion: SuggestionReply): "prompt" | "project_link_update" {
  return suggestion.action.kind === "project_link_update" ? "project_link_update" : "prompt";
}

export function useChatSuggestionRuntime({
  busy,
  focusComposer,
  queuedSuggestion,
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
    queuePrompt(suggestion.message);
  }, [busy, queuePrompt, setStatusText, workflowStatus]);

  useEffect(() => {
    if (!queuedSuggestion) return;
    if (shouldQueueSuggestionReply({ busy, workflowStatus })) return;
    const next = queuedSuggestion;
    setQueuedSuggestion(null);
    queuePrompt(next.message);
    setStatusText(null);
  }, [busy, queuePrompt, queuedSuggestion, setStatusText, workflowStatus]);

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
