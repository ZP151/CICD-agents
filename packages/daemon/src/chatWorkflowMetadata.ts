import {
  type ChatWorkflowState,
  type PendingToolAction,
} from "@mergepilot/core";

export function workflowStateMetadata(
  approvalProposal: PendingToolAction | undefined,
  status: ChatWorkflowState["status"],
): Pick<ChatWorkflowState, "workflowKind" | "workflowPhase"> {
  if (status === "running" && approvalProposal?.workflow?.kind) {
    return {
      workflowKind: approvalProposal.workflow.kind,
      workflowPhase: `running_${approvalProposal.workflow.phase}`,
    };
  }
  if (approvalProposal?.workflow?.kind === "commit") {
    return {
      workflowKind: "commit",
      workflowPhase: commitWorkflowPhaseForApproval(approvalProposal),
    };
  }
  if (approvalProposal?.workflow?.kind === "pr") {
    return {
      workflowKind: "pr",
      workflowPhase: approvalProposal.tool === "ado_create_pr" ? "waiting_for_create_pr_approval" : `waiting_for_${approvalProposal.workflow.phase}`,
    };
  }
  if (approvalProposal?.workflow?.kind === "git") {
    return {
      workflowKind: "git",
      workflowPhase: `waiting_for_${approvalProposal.workflow.phase}_approval`,
    };
  }
  if (approvalProposal?.workflow?.kind === "ci") {
    return {
      workflowKind: "ci",
      workflowPhase: `waiting_for_${approvalProposal.workflow.phase}_approval`,
    };
  }
  if (status === "running" && approvalProposal?.tool.startsWith("git_")) {
    return {
      workflowKind: "git",
      workflowPhase: `running_${approvalProposal.tool}`,
    };
  }
  return {};
}

function commitWorkflowPhaseForApproval(action: PendingToolAction): string {
  if (action.tool === "git_add" && action.workflow?.phase === "stage") return "waiting_for_stage_approval";
  if (action.tool === "git_commit" && action.workflow?.phase === "commit") return "waiting_for_commit_approval";
  if (action.tool === "git_push" && action.workflow?.phase === "push") return "waiting_for_push_approval";
  return `waiting_for_${action.workflow?.phase ?? action.tool}`;
}
