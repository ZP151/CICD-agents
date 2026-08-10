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

  it("builds a pull-rebase proposal for branch sync before push", () => {
    const readiness = pushReadinessFromTools([
      tool("git_upstream", "origin/main\n"),
      tool("git_divergence", "2\t1\n"),
    ]);
    const proposal = buildWorkspaceWorkflowProposal(
      "sync_branch_rebase",
      payload({ action: "sync_branch_rebase", branch: "main" }),
      "main",
      "",
      readiness,
    );

    expect(proposal).toMatchObject({
      tool: "git_pull",
      args: {
        remote: "origin",
        branch: "main",
        rebase: true,
      },
      readiness: {
        status: "diverged",
        upstream: "origin/main",
      },
      workflow: {
        kind: "git",
        phase: "sync_branch",
        branch: "main",
      },
    });
    expect(proposal?.description).toContain("Pull latest changes from origin/main with rebase");
    expect(workflowRiskForAction("sync_branch_rebase", "", undefined)).toBe("high");
  });

  it("builds a fetch-remotes proposal without changing the working tree", () => {
    const proposal = buildWorkspaceWorkflowProposal(
      "fetch_remotes",
      payload({ action: "fetch_remotes" }),
      "main",
      "",
    );

    expect(proposal).toMatchObject({
      tool: "git_fetch",
      args: {
        remote: "origin",
        prune: true,
      },
      workflow: {
        kind: "git",
        phase: "fetch_remotes",
        branch: "main",
      },
    });
    expect(proposal?.description).toContain("Fetch latest remote refs from origin");
    expect(workflowRiskForAction("fetch_remotes", "", undefined)).toBe("medium");
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

  it("blocks PR creation when no target branch is explicitly configured", () => {
    expect(() => buildWorkspaceWorkflowProposal(
      "create_pr",
      payload({
        action: "create_pr",
        branch: "feature/no-target",
        projectLink: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
        },
      }),
      "feature/no-target",
      "",
    )).toThrow("Project Link is missing a PR target branch");
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

  it("flags sensitive config files in change review summaries", () => {
    const summary = summarizeWorkspaceWorkflow("inspect_changes", {
      currentBranch: "main",
      statusText: "?? .env.sample",
      diffStat: "1 file changed, 3 insertions(+)",
      changedFiles: [".env.sample"],
    });

    expect(summary).toContain("Changed files: .env.sample");
    expect(summary).toContain("Security/config risk: .env.sample");
    expect(summary).toContain("secret, credential, API key, token, or environment configuration");
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
