import { describe, expect, it } from "vitest";
import {
  taskStateFromWorkflow,
  workflowStateWithActionSummary,
  type WorkflowEventState,
} from "./Chat.js";

describe("Chat workflow task state", () => {
  it("surfaces PR CI readiness blockers in right-panel steps", () => {
    const state = workflowStateWithActionSummary({
      status: "done",
      currentStep: "PR #42 insight inspected",
      completedTools: [
        "ado_get_pull_request_by_id",
        "ado_list_pull_request_policy_evaluations",
        "ado_list_pull_request_work_items",
      ],
      workflowKind: "pr",
      workflowPhase: "inspected",
    } satisfies WorkflowEventState, [
      "Readiness: blocked. 4 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s).",
      "Info: no linked work items were found.",
    ].join("\n"));

    const task = taskStateFromWorkflow(state, null);

    expect(task?.steps.map((step) => step.label)).toEqual([
      "Load pull request",
      "Analyze PR insight",
      "Review CI blockers",
      "Check policy blockers",
      "Review work items",
    ]);
    expect(task?.steps.find((step) => step.label === "Review CI blockers")).toMatchObject({
      done: false,
      active: true,
    });
    expect(task?.details?.[0]).toContain("Readiness: blocked");
  });

  it("preserves normal PR workflow steps when no readiness blockers are present", () => {
    const task = taskStateFromWorkflow({
      status: "done",
      currentStep: "Policy status checked for PR #42",
      completedTools: ["ado_list_pull_request_policy_evaluations"],
      workflowKind: "pr",
      workflowPhase: "policy_checked",
    }, null);

    expect(task?.steps.map((step) => step.label)).toEqual([
      "Load pull request",
      "Check policy",
    ]);
  });
});
