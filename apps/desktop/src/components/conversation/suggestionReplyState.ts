import type {
  ComposerInputState,
  ComposerInputStateContext,
  ComposerStateNotice,
  ComposerStateNoticeContext,
  SuggestionReply,
  SuggestionReplyBarState,
  SuggestionReplyButtonState,
  SuggestionReplyQueueContext,
} from "./suggestionReplyTypes.js";

export function shouldQueueSuggestionReply(context: SuggestionReplyQueueContext): boolean {
  return Boolean(context.busy || context.workflowStatus === "planning" || context.workflowStatus === "running");
}

export function deriveComposerStateNotice(context: ComposerStateNoticeContext): ComposerStateNotice | null {
  const workflowBusy = isWorkflowBusy(context.workflowStatus);
  if (context.pendingApproval) {
    return {
      tone: "approval",
      label: "Approval pending",
      detail: context.pendingApprovalDescription ?? "Finish the current approval before starting another action.",
    };
  }
  if (context.queuedLabel) {
    return {
      tone: "queued",
      label: "Queued follow-up",
      detail: context.queuedLabel,
    };
  }
  if (context.busy || workflowBusy) {
    return {
      tone: "busy",
      label: "Working",
      detail: context.statusText ?? "You can queue a follow-up while the current action finishes.",
    };
  }
  return null;
}

export function deriveComposerInputState(context: ComposerInputStateContext): ComposerInputState {
  const workflowBusy = isWorkflowBusy(context.workflowStatus);
  if (context.pendingApproval) {
    return {
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "Approve or cancel the pending action before starting another request.",
      inputTitle: "Finish the current approval first.",
      sendTitle: "Finish the current approval first.",
    };
  }

  if (context.busy || workflowBusy) {
    return {
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "MergePilot is working...",
      inputTitle: "MergePilot is working.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    };
  }

  const hasInput = Boolean(context.inputValue?.trim());
  return {
    inputDisabled: false,
    sendDisabled: !hasInput,
    controlsDisabled: false,
    placeholder: "Ask MergePilot...",
    sendTitle: hasInput ? "Send message" : "Type a message first.",
  };
}

export function suggestionReplyButtonState(
  suggestion: SuggestionReply,
  state: SuggestionReplyBarState | undefined,
): SuggestionReplyButtonState {
  if (state?.queuedSuggestionId === suggestion.id) return "queued";
  if (state?.blocked) return "blocked";
  if (state?.busy || isWorkflowBusy(state?.workflowStatus)) return "running";
  return "idle";
}

export function suggestionButtonTitle(
  suggestion: SuggestionReply,
  state: SuggestionReplyButtonState,
  barState: SuggestionReplyBarState | undefined,
): string {
  if (state === "running") return `Queue after current workflow: ${suggestion.message}`;
  if (state === "queued") return "This follow-up is queued and will run after the current workflow finishes.";
  if (state === "blocked") return barState?.blockedReason ?? "Resolve the blocked workflow before starting another action.";
  return suggestion.message;
}

function isWorkflowBusy(status: string | undefined): boolean {
  return status === "planning" || status === "running";
}
