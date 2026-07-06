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
import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../api.js";
import { workspaceActionFromSuggestion } from "./workspaceActionSuggestions.js";
import type { WorkspaceAction } from "./workflowTaskState.js";

interface UseChatSuggestionRuntimeArgs {
  activeProjectLinkId: string | null;
  busy: boolean;
  focusComposer: () => void;
  queuedSuggestion: SuggestionReply | null;
  runWorkspaceAction: (action: WorkspaceAction) => void;
  setInput: Dispatch<SetStateAction<string>>;
  setQueuedSuggestion: Dispatch<SetStateAction<SuggestionReply | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  updateProjectLink: (id: string, data: Partial<ProjectLinkInput>) => Promise<ProjectLink>;
  workflowStatus?: string;
}

export interface ChatSuggestionRuntime {
  cancelQueuedSuggestion: () => void;
  handleSuggestionReply: (suggestion: SuggestionReply) => void;
  queuePrompt: (prompt: string) => void;
}

export function useChatSuggestionRuntime({
  activeProjectLinkId,
  busy,
  focusComposer,
  queuedSuggestion,
  runWorkspaceAction,
  setInput,
  setQueuedSuggestion,
  setStatusText,
  updateProjectLink,
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
    if (suggestion.action.kind === "project_link_update") {
      void saveProjectLinkUpdate({
        activeProjectLinkId,
        suggestion,
        setStatusText,
        updateProjectLink,
      });
      return;
    }
    const action = workspaceActionFromSuggestion(suggestion);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(suggestion.message);
  }, [activeProjectLinkId, busy, queuePrompt, runWorkspaceAction, setStatusText, updateProjectLink, workflowStatus]);

  useEffect(() => {
    if (!queuedSuggestion) return;
    if (shouldQueueSuggestionReply({ busy, workflowStatus })) return;
    const next = queuedSuggestion;
    setQueuedSuggestion(null);
    if (next.action.kind === "project_link_update") {
      void saveProjectLinkUpdate({
        activeProjectLinkId,
        suggestion: next,
        setStatusText,
        updateProjectLink,
      });
      return;
    }
    const action = workspaceActionFromSuggestion(next);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(next.message);
    setStatusText(null);
  }, [activeProjectLinkId, busy, queuePrompt, queuedSuggestion, runWorkspaceAction, setStatusText, updateProjectLink, workflowStatus]);

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

async function saveProjectLinkUpdate({
  activeProjectLinkId,
  suggestion,
  setStatusText,
  updateProjectLink,
}: {
  activeProjectLinkId: string | null;
  suggestion: SuggestionReply;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  updateProjectLink: (id: string, data: Partial<ProjectLinkInput>) => Promise<ProjectLink>;
}): Promise<void> {
  if (suggestion.action.kind !== "project_link_update") return;
  if (!activeProjectLinkId) {
    setStatusText("Select a Project Link before saving a pipeline connection.");
    return;
  }
  const pipelineId = suggestion.action.update.adoPipelineId?.trim();
  const pipelineName = suggestion.action.update.adoPipelineName?.trim();
  if (!pipelineId) {
    setStatusText("No pipeline ID was found in this suggestion.");
    return;
  }

  setStatusText(`Saving pipeline #${pipelineId}${pipelineName ? ` ${pipelineName}` : ""}`);
  try {
    await updateProjectLink(activeProjectLinkId, {
      adoPipelineId: pipelineId,
      adoPipelineName: pipelineName ?? "",
    });
    setStatusText(`Saved pipeline #${pipelineId}${pipelineName ? ` ${pipelineName}` : ""} to this Project Link.`);
  } catch (error) {
    setStatusText(error instanceof Error ? error.message : String(error));
  }
}
