import { describe, expect, it } from "vitest";
import type { ApprovalRequest, WorkflowEventState } from "./chat.types.js";
import {
  statusTextForApprovalResolved,
  statusTextForWorkflowState,
  workflowStateAfterApprovalResolved,
  workflowStateFromApprovalRequired,
} from "./chatWorkflowStreamState.js";

const approval: ApprovalRequest = {
  id: "approval-1",
  riskLevel: "medium",
  explanation: "Review exact args",
  action: {
    tool: "git_commit",
    args: { message: "Refactor chat stream state" },
    description: "Commit staged changes",
  },
};

describe("chat workflow stream state", () => {
  it("maps workflow states to status text without forcing terminal text", () => {
    expect(statusTextForWorkflowState({ status: "planning" } as WorkflowEventState)).toBe("Planning");
    expect(statusTextForWorkflowState({ status: "running" } as WorkflowEventState)).toBe("Executing");
    expect(statusTextForWorkflowState({ status: "waiting_for_approval" } as WorkflowEventState)).toBe("Waiting for approval");
    expect(statusTextForWorkflowState({ status: "done" } as WorkflowEventState)).toBeUndefined();
  });

  it("builds an approval-required workflow state while preserving completed tools", () => {
    const update = workflowStateFromApprovalRequired(approval);
    const next = update({
      status: "running",
      currentStep: "Inspecting changes",
      completedTools: ["git_status"],
    });

    expect(next).toMatchObject({
      status: "waiting_for_approval",
      currentStep: "Commit staged changes",
      completedTools: ["git_status"],
      pendingApproval: approval,
    });
  });

  it("clears pending approval after approval resolution", () => {
    const previous: WorkflowEventState = {
      status: "waiting_for_approval",
      currentStep: "Commit staged changes",
      completedTools: ["git_status"],
      pendingApproval: approval,
    };

    expect(workflowStateAfterApprovalResolved(true)(previous)).toMatchObject({
      status: "running",
      currentStep: "Executing approved action",
      pendingApproval: undefined,
    });
    expect(workflowStateAfterApprovalResolved(false)(previous)).toMatchObject({
      status: "done",
      currentStep: "Approval cancelled",
      pendingApproval: undefined,
    });
    expect(statusTextForApprovalResolved(true)).toBe("Approval accepted");
    expect(statusTextForApprovalResolved(false)).toBe("Approval cancelled");
  });
});
