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

  it("derives PR plan context steps for push and PR creation", () => {
    const task = taskStateFromWorkflow({
      status: "done",
      currentStep: "inspect_pr_plan_context complete",
      completedTools: ["git_current_branch", "git_status", "git_remote", "git_upstream", "git_divergence"],
      workflowKind: "pr",
      workflowPhase: "pr_plan_context_inspected",
      workflowSummary: [
        "PR plan context:",
        "- Source branch: feature/review",
        "- Target branch: main",
        "- Azure DevOps target: Demo/DemoRepo",
        "- Working tree: clean",
        "- Push readiness: Branch is ahead of origin/main by 1 commit.",
        "- PR readiness: Ready to create PR feature/review -> main in Demo/DemoRepo.",
      ].join("\n"),
    }, "Prepare PR plan");

    expect(task?.goal).toBe("Prepare PR plan");
    expect(task?.steps.map((step) => [step.label, step.done, step.active, step.action])).toEqual([
      ["Inspect PR plan", true, false, undefined],
      ["Push branch", false, true, { type: "push_branch", branch: "feature/review" }],
      ["Create pull request", false, false, { type: "create_pr", branch: "feature/review", targetBranch: "main", draft: false }],
    ]);
  });

  it("derives dirty PR plan context steps before push or PR creation", () => {
    const task = taskStateFromWorkflow({
      status: "done",
      currentStep: "inspect_pr_plan_context complete",
      completedTools: ["git_current_branch", "git_status", "git_remote"],
      workflowKind: "pr",
      workflowPhase: "pr_plan_context_inspected",
      workflowSummary: [
        "PR plan context:",
        "- Source branch: feature/review",
        "- Target branch: main",
        "- Azure DevOps target: missing",
        "- Working tree: 2 modified files",
        "- Push readiness: No upstream configured.",
        "- PR readiness: missing_ado_mapping. Complete Project Link mapping before creating the PR.",
      ].join("\n"),
    }, null);

    expect(task?.goal).toBe("PR plan");
    expect(task?.steps.map((step) => [step.label, step.active, step.action?.type])).toEqual([
      ["Inspect PR plan", false, undefined],
      ["Review and commit changes", true, "prepare_commit"],
      ["Publish branch", false, "push_branch"],
      ["Check ADO context", false, "inspect_ado_auth_context"],
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

  it("derives branch sync workflow steps and follow-up actions", () => {
    const waiting = taskStateFromWorkflow({
      status: "waiting_for_approval",
      currentStep: "Pull latest changes from origin/main with rebase before pushing.",
      completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote", "git_upstream", "git_divergence"],
      workflowKind: "git",
      workflowPhase: "waiting_for_sync_branch_approval",
      pendingApproval: {
        id: "approval-sync",
        riskLevel: "high",
        explanation: "Pull latest changes from origin/main with rebase before pushing.",
        action: {
          tool: "git_pull",
          args: { remote: "origin", branch: "main", rebase: true },
          description: "Pull latest changes from origin/main with rebase before pushing.",
          workflow: { kind: "git", phase: "sync_branch", branch: "main" },
          readiness: {
            kind: "push",
            status: "behind",
            upstream: "origin/main",
            ahead: 0,
            behind: 1,
            summary: "Branch is behind origin/main by 1 commit.",
          },
        },
      },
    }, null);

    expect(waiting?.steps.map((step) => [step.label, step.done, step.active, step.action?.type])).toEqual([
      ["Check branch readiness", true, false, undefined],
      ["Pull with rebase", false, true, undefined],
      ["Refresh branch status", false, false, "refresh_branch"],
      ["Push when ready", false, false, "push_branch"],
    ]);
    expect(waiting?.risk).toBe("high");
    expect(waiting?.details).toContain("Branch is behind origin/main by 1 commit.");

    const synced = taskStateFromWorkflow({
      status: "done",
      currentStep: "Synced branch main",
      completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote", "git_upstream", "git_divergence", "git_pull"],
      workflowKind: "git",
      workflowPhase: "synced",
    }, null);

    expect(synced?.steps.map((step) => [step.label, step.done, step.active, step.action?.type])).toEqual([
      ["Check branch readiness", true, false, undefined],
      ["Pull with rebase", true, false, undefined],
      ["Refresh branch status", false, true, "refresh_branch"],
      ["Push when ready", false, false, "push_branch"],
    ]);
    expect(synced?.steps[3]?.action).toEqual({ type: "push_branch", branch: "main" });
  });

  it("derives fetch-remotes workflow steps and refresh follow-up", () => {
    const waiting = taskStateFromWorkflow({
      status: "waiting_for_approval",
      currentStep: "Fetch latest remote refs from origin.",
      completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote"],
      workflowKind: "git",
      workflowPhase: "waiting_for_fetch_remotes_approval",
      pendingApproval: {
        id: "approval-fetch",
        riskLevel: "medium",
        explanation: "Fetch latest remote refs from origin.",
        action: {
          tool: "git_fetch",
          args: { remote: "origin", prune: true },
          description: "Fetch latest remote refs from origin.",
          workflow: { kind: "git", phase: "fetch_remotes", branch: "main" },
        },
      },
    }, null);

    expect(waiting?.steps.map((step) => [step.label, step.done, step.active, step.action?.type])).toEqual([
      ["Check remote", true, false, undefined],
      ["Fetch remotes", false, true, undefined],
      ["Refresh branch status", false, false, "refresh_branch"],
    ]);
    expect(waiting?.risk).toBe("medium");

    const fetched = taskStateFromWorkflow({
      status: "done",
      currentStep: "Fetched origin",
      completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote", "git_fetch"],
      workflowKind: "git",
      workflowPhase: "fetched",
    }, null);

    expect(fetched?.steps.map((step) => [step.label, step.done, step.active, step.action?.type])).toEqual([
      ["Check remote", true, false, undefined],
      ["Fetch remotes", true, false, undefined],
      ["Refresh branch status", false, true, "refresh_branch"],
    ]);
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
