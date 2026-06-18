import type { ApprovalRequest, WorkflowEventState } from "./chat.types.js";

export type WorkflowStateUpdate =
  | WorkflowEventState
  | null
  | ((prev: WorkflowEventState | null) => WorkflowEventState | null);

export function statusTextForWorkflowState(state: WorkflowEventState | null | undefined): string | null | undefined {
  if (state?.status === "waiting_for_approval") return "Waiting for approval";
  if (state?.status === "running") return "Executing";
  if (state?.status === "planning") return "Planning";
  return undefined;
}

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

export function statusTextForApprovalResolved(approved: boolean | undefined): string {
  return approved ? "Approval accepted" : "Approval cancelled";
}
