import type { ProjectLink } from "../../api.js";
import { useChatDerivedState } from "./chatDerivedState.js";
import type {
  Bubble,
  WorkflowEventState,
} from "./chat.types.js";
import {
  useChatModelRuntime,
} from "./useChatModelRuntime.js";

interface UseChatPageReadModelOptions {
  activeProjectLink: ProjectLink | null;
  bubbles: Bubble[];
  busy: boolean;
  input: string;
  queuedSuggestionLabel?: string;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
}

export function useChatPageReadModel({
  activeProjectLink,
  bubbles,
  busy,
  input,
  queuedSuggestionLabel,
  statusText,
  workflowState,
}: UseChatPageReadModelOptions) {
  const derivedState = useChatDerivedState({
    activeProjectLink,
    bubbles,
    busy,
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
