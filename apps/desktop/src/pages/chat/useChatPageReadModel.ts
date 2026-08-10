import type { ProjectLink } from "../../api.js";
import { useChatDerivedState } from "./chatDerivedState.js";
import type {
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";
import {
  useChatModelRuntime,
} from "./useChatModelRuntime.js";
import type { WorkspaceContextSnapshot } from "./workspaceContextSnapshot.js";

interface UseChatPageReadModelOptions {
  activeProjectLink: ProjectLink | null;
  bubbles: Bubble[];
  busy: boolean;
  input: string;
  queuedSuggestionLabel?: string;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
  workspaceContext: WorkspaceContextSnapshot | null;
}

export function useChatPageReadModel({
  activeProjectLink,
  bubbles,
  busy,
  input,
  queuedSuggestionLabel,
  statusText,
  workflowState,
  workspaceContext,
}: UseChatPageReadModelOptions) {
  const derivedState = useChatDerivedState({
    activeProjectLink,
    bubbles,
    busy,
    input,
    queuedSuggestionLabel,
    statusText,
    workflowState,
    workspaceContext,
  });

  const modelRuntime = useChatModelRuntime({
    closeForComposerState: busy || Boolean(derivedState.composerPendingApproval),
  });

  return {
    ...derivedState,
    ...modelRuntime,
  };
}
