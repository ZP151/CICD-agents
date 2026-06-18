import type { ProjectLink } from "../../api.js";
import { useChatDerivedState } from "./chatDerivedState.js";
import type {
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";
import { useChatIndexStatus } from "./useChatIndexStatus.js";
import {
  useChatModelRuntime,
} from "./useChatModelRuntime.js";

interface UseChatPageReadModelOptions {
  activeProjectLink: ProjectLink | null;
  activeProjectLinkId: string | null;
  bubbles: Bubble[];
  busy: boolean;
  input: string;
  queuedSuggestionLabel?: string;
  repoPath: string;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
}

export function useChatPageReadModel({
  activeProjectLink,
  activeProjectLinkId,
  bubbles,
  busy,
  input,
  queuedSuggestionLabel,
  repoPath,
  statusText,
  workflowState,
}: UseChatPageReadModelOptions) {
  const indexStatus = useChatIndexStatus({
    activeProjectLinkId,
    repoPath,
  });

  const derivedState = useChatDerivedState({
    activeProjectLink,
    bubbles,
    busy,
    indexStatus,
    input,
    queuedSuggestionLabel,
    statusText,
    workflowState,
  });

  const modelRuntime = useChatModelRuntime({
    closeForComposerState: busy || Boolean(derivedState.composerPendingApproval),
  });

  return {
    ...derivedState,
    ...modelRuntime,
  };
}
