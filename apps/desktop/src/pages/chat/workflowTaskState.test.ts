import { describe, expect, it } from "vitest";
import type { WorkflowEventState } from "./chat.types.js";
import {
  gitRecoveryPanelState,
  taskStateFromWorkflow,
  workflowStateWithActionSummary,
  workflowStepActionState,
} from "./workflowTaskState.js";

describe("workflow task state", () => {
  it("derives commit workflow steps and push follow-up", () => {
    const task = taskStateFromWorkflow({
      status: "waiting_for_approval",
      currentStep: "git_push",
      completedTools: ["git_status", "git_diff", "git_add", "git_commit"],
      workflowKind: "commit",
      workflowPhase: "waiting_for_push_approval",
      pendingApproval: {
        id: "approval-push",
        riskLevel: "medium",
        explanation: "Push branch",
        action: {
          tool: "git_push",
          args: {},
          description: "Push committed branch",
          workflow: { kind: "commit", phase: "push", branch: "feature/refactor" },
        },
      },
    }, "Commit current work");

    expect(task).toMatchObject({
      goal: "Commit current work",
      currentStepLabel: "Push committed branch",
      risk: "medium",
    });
    expect(task?.steps.map((step) => [step.label, step.done, step.active])).toEqual([
      ["Inspect changes", true, false],
      ["Stage changes", true, false],
      ["Commit changes", true, false],
      ["Push branch", false, true],
    ]);
    expect(task?.details).toContain("Branch: feature/refactor");
  });

  it("derives PR readiness follow-up actions from summary signals", () => {
    const task = taskStateFromWorkflow({
      status: "done",
      currentStep: "Readiness: blocked. 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s).",
      completedTools: ["ado_get_pull_request_by_id"],
      workflowKind: "pr",
      workflowPhase: "inspected",
      workflowSummary: "Readiness: blocked. 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s).",
    }, "PR readiness");

    expect(task?.steps.map((step) => ({
      label: step.label,
      active: step.active,
      action: step.action?.type,
    }))).toEqual([
      { label: "Load pull request", active: false, action: undefined },
      { label: "Analyze PR insight", active: false, action: undefined },
      { label: "Review CI blockers", active: true, action: "run_tests" },
      { label: "Check policy blockers", active: false, action: "check_pr_policy" },
      { label: "Review work items", active: false, action: "list_pr_work_items" },
    ]);
  });

  it("derives pipeline workflow state and summarized CI details", () => {
    const workflow: WorkflowEventState = {
      status: "waiting_for_approval",
      currentStep: "Trigger pipeline",
      completedTools: ["ado_list_pipeline_runs"],
      workflowKind: "ci",
      workflowPhase: "pipeline_inspected",
      workflowSummary: "Latest pipeline run failed. Investigate before triggering.",
      pendingApproval: {
        id: "approval-pipeline",
        riskLevel: "medium",
        explanation: "Trigger pipeline",
        action: {
          tool: "ado_trigger_pipeline",
          args: { pipelineId: 12 },
          description: "Run CI pipeline",
        },
      },
    };

    const task = taskStateFromWorkflow(workflow, null);

    expect(task?.goal).toBe("Pipeline workflow");
    expect(task?.steps.map((step) => [step.label, step.done, step.active])).toEqual([
      ["Inspect pipeline", true, false],
      ["Review latest runs", true, false],
      ["Trigger pipeline", false, true],
      ["Review run status", false, false],
    ]);
    expect(task?.details).toContain("Latest pipeline run failed. Investigate before triggering.");
  });

  it("maps step action states and Git recovery panels", () => {
    expect(workflowStepActionState({ label: "Stage", done: false, active: true }, { busy: true })).toBe("running");
    expect(workflowStepActionState({ label: "Commit", done: false, active: false }, { busy: true })).toBe("waiting");
    expect(workflowStepActionState({ label: "Done", done: true, active: false }, {})).toBe("done");
    expect(workflowStepActionState({ label: "Blocked", done: false, active: true }, { workflowStatus: "blocked" })).toBe("blocked");

    expect(gitRecoveryPanelState({
      status: "blocked",
      currentStep: "Resolve conflicts",
      completedTools: [],
      workflowKind: "git",
      workflowPhase: "rebase_conflicts",
    })).toMatchObject({
      label: "Rebase",
      actions: [
        { type: "continue_rebase" },
        { type: "abort_rebase" },
        { type: "skip_rebase" },
      ],
    });
  });

  it("attaches action summaries without mutating empty workflow state", () => {
    expect(workflowStateWithActionSummary(null, "done")).toBeNull();
    expect(workflowStateWithActionSummary({
      status: "done",
      currentStep: "Complete",
      completedTools: [],
    }, "  ")).toEqual({
      status: "done",
      currentStep: "Complete",
      completedTools: [],
    });
    expect(workflowStateWithActionSummary({
      status: "done",
      currentStep: "Complete",
      completedTools: [],
    }, "Validation passed")).toMatchObject({
      workflowSummary: "Validation passed",
    });
  });
});
