import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "./chat.types.js";
import {
  workspaceActionMatchesApproval,
  workspaceActionToolCandidates,
} from "./workspaceActionTools.js";
import { workspaceActionToDirectWorkflow } from "./workspaceActionWorkflow.js";
import {
  workspaceActionFromSuggestion,
  workspaceActionFromWelcomeSuggestion,
} from "./workspaceActionSuggestions.js";

describe("workspace action Modules", () => {
  it("maps workspace actions to candidate tools and approval matches", () => {
    expect(workspaceActionToolCandidates({ type: "commit_and_push", includeUnstaged: true })).toEqual([
      "git_add",
      "git_commit",
      "git_push",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_staged_changes" })).toEqual([
      "git_status",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
    expect(workspaceActionToolCandidates({ type: "draft_commit_message" })).toEqual([
      "git_status",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
      "git_log",
    ]);
    expect(workspaceActionToolCandidates({ type: "explain_change_scope" })).toEqual([
      "git_status",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
    expect(workspaceActionToolCandidates({ type: "sync_branch_rebase", branch: "main" })).toEqual(["git_pull"]);
    expect(workspaceActionToolCandidates({ type: "fetch_remotes" })).toEqual(["git_fetch"]);
    expect(workspaceActionToolCandidates({ type: "refresh_branch" })).toEqual([
      "git_current_branch",
      "git_branch_list",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_remote_target" })).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_latest_commit" })).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
      "git_log_subject",
      "git_show_head_stat",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_validation_failure" })).toEqual([
      "validation_failure_artifact",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_ci_recovery_context" })).toEqual([
      "validation_failure_artifact",
      "pipeline_failure_artifact",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_source_context" })).toEqual([
      "source_context",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_architecture_context" })).toEqual([
      "repository_context",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_ado_auth_context" })).toEqual([
      "ado_auth_context",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_pr_plan_context" })).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
      "git_log_subject",
    ]);
    expect(workspaceActionToolCandidates({ type: "inspect_pr_insight" })).toContain("ado_get_pull_request_changes");

    const approval: ApprovalRequest = {
      id: "approval-1",
      action: {
        tool: "git_commit",
        args: { message: "test" },
        description: "Commit staged changes",
      },
      riskLevel: "medium",
      explanation: "Commit requires approval.",
    };

    expect(workspaceActionMatchesApproval({ type: "prepare_commit", includeUnstaged: false }, approval)).toBe(true);
    expect(workspaceActionMatchesApproval({ type: "inspect_changes" }, approval)).toBe(false);
  });

  it("adapts workspace actions to direct workflow actions", () => {
    expect(workspaceActionToDirectWorkflow({
      type: "commit_and_push",
      branch: "feature/refactor",
      message: "Refactor chat workspace actions",
      includeUnstaged: true,
    })).toEqual({
      action: "prepare_commit",
      input: {
        branch: "feature/refactor",
        message: "Refactor chat workspace actions",
        includeUnstaged: true,
        commitMode: "commit-push",
      },
    });

    expect(workspaceActionToDirectWorkflow({
      type: "sync_branch_rebase",
      branch: "main",
    })).toEqual({
      action: "sync_branch_rebase",
      input: {
        branch: "main",
      },
    });

    expect(workspaceActionToDirectWorkflow({ type: "fetch_remotes" })).toEqual({
      action: "fetch_remotes",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_remote_target" })).toEqual({
      action: "inspect_remote_target",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_latest_commit" })).toEqual({
      action: "inspect_latest_commit",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_validation_failure" })).toEqual({
      action: "inspect_validation_failure",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_ci_recovery_context" })).toEqual({
      action: "inspect_ci_recovery_context",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_source_context" })).toEqual({
      action: "inspect_source_context",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_architecture_context" })).toEqual({
      action: "inspect_architecture_context",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_ado_auth_context" })).toEqual({
      action: "inspect_ado_auth_context",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_pr_plan_context" })).toEqual({
      action: "inspect_pr_plan_context",
    });

    expect(workspaceActionToDirectWorkflow({ type: "inspect_staged_changes" })).toEqual({
      action: "inspect_staged_changes",
    });

    expect(workspaceActionToDirectWorkflow({ type: "draft_commit_message" })).toEqual({
      action: "draft_commit_message",
    });

    expect(workspaceActionToDirectWorkflow({ type: "explain_change_scope" })).toEqual({
      action: "explain_change_scope",
    });

    expect(workspaceActionToDirectWorkflow({
      type: "create_pr",
      branch: "feature/refactor",
      targetBranch: "main",
      title: "Refactor",
      draft: true,
    })).toEqual({
      action: "create_pr",
      input: {
        branch: "feature/refactor",
        targetBranch: "main",
        title: "Refactor",
        description: undefined,
        draft: true,
      },
    });
  });

  it("adapts quick replies and welcome suggestions to workspace actions", () => {
    expect(workspaceActionFromSuggestion({
      id: "run-tests",
      label: "Run tests",
      message: "Run tests",
      action: { kind: "workspace_action", action: "run_tests" },
    })).toEqual({ type: "run_tests" });

    expect(workspaceActionFromSuggestion({
      id: "fetch-remotes",
      label: "Fetch remotes",
      message: "Fetch remotes",
      action: { kind: "workspace_action", action: "fetch_remotes" },
    })).toEqual({ type: "fetch_remotes" });

    expect(workspaceActionFromSuggestion({
      id: "remote-target",
      label: "Show remote target",
      message: "Show remote target",
      action: { kind: "workspace_action", action: "inspect_remote_target" },
    })).toEqual({ type: "inspect_remote_target" });

    expect(workspaceActionFromSuggestion({
      id: "latest-commit",
      label: "Review commit",
      message: "Review commit",
      action: { kind: "workspace_action", action: "inspect_latest_commit" },
    })).toEqual({ type: "inspect_latest_commit" });

    expect(workspaceActionFromSuggestion({
      id: "validation-failure",
      label: "Analyze failure",
      message: "Analyze failure",
      action: { kind: "workspace_action", action: "inspect_validation_failure" },
    })).toEqual({ type: "inspect_validation_failure" });

    expect(workspaceActionFromSuggestion({
      id: "ci-recovery",
      label: "Validation recovery",
      message: "Validation recovery",
      action: { kind: "workspace_action", action: "inspect_ci_recovery_context" },
    })).toEqual({ type: "inspect_ci_recovery_context" });

    expect(workspaceActionFromSuggestion({
      id: "source-context",
      label: "List key files",
      message: "List key files",
      action: { kind: "workspace_action", action: "inspect_source_context" },
    })).toEqual({ type: "inspect_source_context" });

    expect(workspaceActionFromSuggestion({
      id: "architecture-context",
      label: "Trace request flow",
      message: "Trace request flow",
      action: { kind: "workspace_action", action: "inspect_architecture_context" },
    })).toEqual({ type: "inspect_architecture_context" });

    expect(workspaceActionFromSuggestion({
      id: "ado-auth",
      label: "Check auth",
      message: "Check auth",
      action: { kind: "workspace_action", action: "inspect_ado_auth_context" },
    })).toEqual({ type: "inspect_ado_auth_context" });

    expect(workspaceActionFromSuggestion({
      id: "pr-plan",
      label: "Prepare PR plan",
      message: "Prepare PR plan",
      action: { kind: "workspace_action", action: "inspect_pr_plan_context" },
    })).toEqual({ type: "inspect_pr_plan_context" });

    expect(workspaceActionFromSuggestion({
      id: "staged-diff",
      label: "Check staged diff",
      message: "Check staged diff",
      action: { kind: "workspace_action", action: "inspect_staged_changes" },
    })).toEqual({ type: "inspect_staged_changes" });

    expect(workspaceActionFromSuggestion({
      id: "draft-message",
      label: "Draft commit message",
      message: "Draft commit message",
      action: { kind: "workspace_action", action: "draft_commit_message" },
    })).toEqual({ type: "draft_commit_message" });

    expect(workspaceActionFromSuggestion({
      id: "change-scope",
      label: "Explain change scope",
      message: "Explain change scope",
      action: { kind: "workspace_action", action: "explain_change_scope" },
    })).toEqual({ type: "explain_change_scope" });

    expect(workspaceActionFromSuggestion({
      id: "sync",
      label: "Pull/rebase first",
      message: "Pull/rebase first",
      action: { kind: "workspace_action", action: "sync_branch_rebase" },
    })).toEqual({ type: "sync_branch_rebase" });

    expect(workspaceActionFromSuggestion({
      id: "prepare",
      label: "Prepare commit",
      message: "Prepare commit",
      action: { kind: "workspace_action", action: "prepare_commit" },
    })).toEqual({ type: "prepare_commit", includeUnstaged: true });

    expect(workspaceActionFromSuggestion({
      id: "push",
      label: "Push branch",
      message: "Push branch",
      action: { kind: "workspace_action", action: "push_branch" },
    })).toEqual({ type: "push_branch" });

    expect(workspaceActionFromSuggestion({
      id: "fill",
      label: "Explain",
      message: "Explain",
      action: { kind: "fill_composer" },
    })).toBeNull();

    expect(workspaceActionFromWelcomeSuggestion("Understand this project")).toEqual({ type: "inspect_architecture_context" });
    expect(workspaceActionFromWelcomeSuggestion("Explain this project architecture")).toEqual({ type: "inspect_architecture_context" });
    expect(workspaceActionFromWelcomeSuggestion("Review my changes")).toEqual({ type: "inspect_changes" });
    expect(workspaceActionFromWelcomeSuggestion("What's on this branch?")).toEqual({ type: "refresh_branch" });
    expect(workspaceActionFromWelcomeSuggestion("Analyze PR insight for this repo")).toEqual({ type: "inspect_pr_insight" });
    expect(workspaceActionFromWelcomeSuggestion("Check the CI/CD pipeline state")).toEqual({ type: "inspect_pipeline" });
    expect(workspaceActionFromWelcomeSuggestion("Open Pipelines workspace")).toEqual({ type: "inspect_pipeline" });
    expect(workspaceActionFromWelcomeSuggestion("Find the build and test commands")).toEqual({ type: "inspect_architecture_context" });
    expect(workspaceActionFromWelcomeSuggestion("Stage and commit")).toEqual({ type: "prepare_commit", includeUnstaged: true });
    expect(workspaceActionFromWelcomeSuggestion("Run tests")).toEqual({ type: "run_tests" });
    expect(workspaceActionFromWelcomeSuggestion("Push and create PR")).toEqual({ type: "inspect_pr_plan_context" });
    expect(workspaceActionFromWelcomeSuggestion("Prepare a PR plan")).toEqual({ type: "inspect_pr_plan_context" });
  });
});
