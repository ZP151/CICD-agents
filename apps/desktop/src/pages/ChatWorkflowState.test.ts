import { describe, expect, it } from "vitest";
import {
  taskStateFromWorkflow,
  workflowStepActionState,
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
      action: { type: "run_tests" },
    });
    expect(task?.steps.find((step) => step.label === "Check policy blockers")).toMatchObject({
      active: false,
      action: { type: "check_pr_policy" },
    });
    expect(task?.steps.find((step) => step.label === "Review work items")).toMatchObject({
      active: false,
      action: { type: "list_pr_work_items" },
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

  it("derives visible action states for right-panel workflow steps", () => {
    const activeStep = {
      label: "Review CI blockers",
      done: false,
      active: true,
      action: { type: "run_tests" as const },
    };
    const idleStep = {
      label: "Check policy blockers",
      done: false,
      active: false,
      action: { type: "check_pr_policy" as const },
    };
    const doneStep = {
      label: "Review work items",
      done: true,
      active: false,
      action: { type: "list_pr_work_items" as const },
    };

    expect(workflowStepActionState(activeStep, { workflowStatus: "running" })).toBe("running");
    expect(workflowStepActionState(idleStep, { workflowStatus: "running" })).toBe("waiting");
    expect(workflowStepActionState(doneStep, { workflowStatus: "done" })).toBe("done");
    expect(workflowStepActionState(idleStep, { workflowStatus: "blocked" })).toBe("blocked");
    expect(workflowStepActionState(idleStep, { workflowStatus: "done" })).toBe("idle");
  });

  it("surfaces pipeline workflow steps after inspecting Azure Pipelines", () => {
    const task = taskStateFromWorkflow({
      status: "done",
      currentStep: "Pipeline #12 readiness inspected",
      completedTools: ["ado_list_pipeline_runs"],
      workflowKind: "ci",
      workflowPhase: "pipeline_inspected",
      workflowSummary: "Pipeline #12 latest run #77 20260613.1: completed/failed.",
    }, null);

    expect(task?.goal).toBe("Pipeline workflow");
    expect(task?.steps.map((step) => step.label)).toEqual([
      "Inspect pipeline",
      "Review latest runs",
      "Trigger pipeline",
      "Review run status",
    ]);
    expect(task?.steps.find((step) => step.label === "Inspect pipeline")).toMatchObject({
      done: true,
      action: { type: "inspect_pipeline" },
    });
    expect(task?.steps.find((step) => step.label === "Trigger pipeline")).toMatchObject({
      done: false,
      active: true,
      action: { type: "trigger_pipeline" },
    });
    expect(task?.details?.[0]).toContain("Pipeline #12 latest run");
  });
});
