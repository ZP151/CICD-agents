import type { ApprovalRequest, WorkflowEventState } from "./chat.types.js";

export type WorkflowStateUpdate =
  | WorkflowEventState
  | null
  | ((prev: WorkflowEventState | null) => WorkflowEventState | null);

export function workflowStateFromApprovalRequired(
  approval: ApprovalRequest,
): (prev: WorkflowEventState | null) => WorkflowEventState {
  return (prev) => ({
    status: "waiting_for_approval",
    currentStep: approval.action.description ?? "Waiting for approval",
    completedTools: prev?.completedTools ?? [],
    pendingApproval: approval,
  });
}

export function workflowStateAfterApprovalResolved(
  approved: boolean | undefined,
): (prev: WorkflowEventState | null) => WorkflowEventState | null {
  return (prev) =>
    prev
      ? {
          ...prev,
          status: approved ? "running" : "done",
          currentStep: approved ? "Executing approved action" : "Approval cancelled",
          pendingApproval: undefined,
        }
      : prev;
}
