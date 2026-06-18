import { describe, expect, it } from "vitest";
import { branchPreflightFromTools } from "../src/workflows/workspaceBranchPreflight.js";
import {
  buildWorkspaceWorkflowProposal,
  isGitRecoveryWorkflowAction,
  pushReadinessFromTools,
  summarizeWorkspaceWorkflow,
  workflowRiskForAction,
} from "../src/workflows/workspaceWorkflow.js";
import type { ChatWorkflowActionPayload } from "../src/routes/chat-workflow.routes.js";
import type { GitOperationState } from "../src/workflows/gitOperation.js";

describe("workspaceWorkflow", () => {
  it("detects remote-only branches and builds a tracking switch proposal", () => {
    const preflight = branchPreflightFromTools("checkout_branch", payload({
      action: "checkout_branch",
      branch: "feature/new-flow",
    }), [
      tool("git_current_branch", "main\n"),
      tool("git_branch_list", "main\nremotes/origin/feature/new-flow\n"),
    ]);

    const proposal = buildWorkspaceWorkflowProposal(
      "checkout_branch",
      payload({ action: "checkout_branch", branch: "feature/new-flow" }),
      "main",
      "",
      undefined,
      preflight,
    );

    expect(preflight).toMatchObject({
      status: "remote_only",
      branch: "feature/new-flow",
      remoteBranch: "origin/feature/new-flow",
    });
    expect(proposal).toMatchObject({
      tool: "git_switch",
      args: {
        branch: "feature/new-flow",
        startPoint: "origin/feature/new-flow",
        track: true,
      },
    });
  });

  it("summarizes push divergence as high-risk readiness", () => {
    const readiness = pushReadinessFromTools([
      tool("git_upstream", "origin/main\n"),
      tool("git_divergence", "2\t1\n"),
    ]);

    expect(readiness).toMatchObject({
      kind: "push",
      status: "diverged",
      upstream: "origin/main",
      ahead: 1,
      behind: 2,
    });
    expect(workflowRiskForAction("push_branch", "", undefined)).toBe("high");
  });

  it("builds a staged commit proposal with commit-push context", () => {
    const proposal = buildWorkspaceWorkflowProposal(
      "prepare_commit",
      payload({
        action: "prepare_commit",
        message: "refactor daemon workflow modules",
        commitMode: "commit-push",
      }),
      "feature/workflow-refactor",
      " M packages/daemon/src/server.ts",
    );

    expect(proposal).toMatchObject({
      tool: "git_add",
      args: { all: true },
      workflow: {
        kind: "commit",
        phase: "stage",
        branch: "feature/workflow-refactor",
        message: "refactor daemon workflow modules",
        pushAfterCommit: true,
      },
    });
    expect(proposal?.nextHint).toContain("then push the branch");
  });

  it("builds recovery proposals only for matching in-progress Git operations", () => {
    const operationState: GitOperationState = {
      phase: "merge",
      status: "conflicted",
      summary: "Merge has unresolved conflicts in 2 files.",
      conflictFiles: ["src/a.ts", "src/b.ts"],
      gitDirPath: ".git",
    };

    const proposal = buildWorkspaceWorkflowProposal(
      "continue_merge",
      payload({ action: "continue_merge" }),
      "feature/conflict",
      "",
      undefined,
      undefined,
      operationState,
    );

    expect(isGitRecoveryWorkflowAction("continue_merge")).toBe(true);
    expect(proposal).toMatchObject({
      tool: "git_merge",
      args: { action: "continue" },
      workflow: {
        kind: "git",
        phase: "continue_merge",
      },
    });
  });

  it("summarizes observable workspace evidence for UI decisions", () => {
    const summary = summarizeWorkspaceWorkflow("inspect_changes", {
      currentBranch: "feature/workflow-refactor",
      statusText: " M packages/daemon/src/server.ts\n?? packages/daemon/src/workflows/workspaceWorkflow.ts",
      diffStat: "2 files changed, 300 insertions(+), 200 deletions(-)",
      changedFiles: [
        "packages/daemon/src/server.ts",
        "packages/daemon/src/workflows/workspaceWorkflow.ts",
      ],
    });

    expect(summary).toContain("Branch: feature/workflow-refactor");
    expect(summary).toContain("Git status: 2 line(s)");
    expect(summary).toContain("Changed files: packages/daemon/src/server.ts");
    expect(summary).toContain("2 files changed");
  });
});

function payload(overrides: Partial<ChatWorkflowActionPayload>): ChatWorkflowActionPayload {
  return {
    action: "inspect_changes",
    repoPath: process.cwd(),
    draft: false,
    paths: [],
    includeUnstaged: true,
    projectLink: undefined,
    ...overrides,
  } as ChatWorkflowActionPayload;
}

function tool(name: string, stdout: string, ok = true) {
  return {
    name,
    command: name,
    ok,
    stdout,
    stderr: "",
    returncode: ok ? 0 : 1,
  };
}
