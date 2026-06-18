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
      id: "fill",
      label: "Explain",
      message: "Explain",
      action: { kind: "fill_composer" },
    })).toBeNull();

    expect(workspaceActionFromWelcomeSuggestion("Run tests")).toEqual({ type: "run_tests" });
    expect(workspaceActionFromWelcomeSuggestion("Explain architecture")).toBeNull();
  });
});
