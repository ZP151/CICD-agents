import { describe, expect, it, vi } from "vitest";
import type { ProjectLink } from "@mergepilot/core";
import { preparePullRequest, type PullRequestPreparationDependencies } from "../src/pullRequestPreparation.js";

const projectLink: ProjectLink = {
  id: "claimbot",
  name: "ClaimBot_API",
  createdAt: 1,
  updatedAt: 1,
  repoPath: "C:/work/ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://dev.azure.com/tebssg",
  adoProject: "TeBS-ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "test-pat",
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

function gitResult(stdout = "", returncode = 0) {
  return { returncode, stdout, stderr: returncode ? "failed" : "" };
}

function dependencies(): PullRequestPreparationDependencies {
  return {
    runGit: vi.fn(async (_repoPath, args) => {
      const command = args.join(" ");
      if (command === "branch --show-current") return gitResult("mergepilot-e2e/guided-pr\n");
      if (command === "rev-parse HEAD") return gitResult("abc123\n");
      if (command === "status --porcelain=v1") return gitResult("");
      if (command.includes("@{u}")) return gitResult("origin/mergepilot-e2e/guided-pr\n");
      if (command === "rev-parse --verify refs/remotes/origin/main") return gitResult("def456\n");
      if (command === "rev-parse refs/remotes/origin/main") return gitResult("def456\n");
      if (command.startsWith("rev-list --left-right --count")) return gitResult("0\t2\n");
      if (command.startsWith("log --format=")) return gitResult("abc123\tHandle claim retry outcome\nabc122\tAdd retry test\n");
      if (command.startsWith("diff --stat")) return gitResult("2 files changed, 24 insertions(+), 3 deletions(-)\n");
      if (command.startsWith("diff --name-only")) return gitResult("BotToSharePoint/Claim.cs\ntests/ClaimTests.cs\n");
      return gitResult("", 1);
    }),
    getAuth: vi.fn(async () => ({ mode: "pat", pat: "test-pat" })),
    listRepositories: vi.fn(async () => [{ id: "repo-guid", name: "ClaimBot_API", description: "main", url: "" }]),
    readWorkItem: vi.fn(async () => ({
      id: 7913,
      revision: 2,
      type: "Task",
      title: "Handle claim retry outcome",
      state: "Active",
      description: "Expose retry outcomes.",
      acceptanceCriteria: "A failed retry keeps its claim identifier.",
      tags: ["MergePilot Fixture"],
      assignedTo: "Ada",
      relations: [],
      linkedPullRequests: [],
      linkedBuilds: [],
      testEvidence: [],
      comments: [],
    })),
    listBranchPolicies: vi.fn(async () => [{
      id: 17,
      revision: 3,
      typeId: "reviewers",
      displayName: "Minimum reviewers",
      isEnabled: true,
      isBlocking: true,
    }]),
    readBranch: vi.fn(async (args) => ({ objectId: args.branch === "main" ? "def456" : "abc123" })),
    now: () => 1_786_000_000_000,
  };
}

describe("preparePullRequest", () => {
  it("joins local Git, Work Item, repository identity, and branch policy reads", async () => {
    const deps = dependencies();
    const preparation = await preparePullRequest({
      projectLink,
      preferences: { workItemId: 7913 },
      dependencies: deps,
    });

    expect(preparation).toMatchObject({
      projectLinkId: "claimbot",
      repositoryId: "repo-guid",
      generatedAt: 1_786_000_000_000,
      git: {
        sourceBranch: "mergepilot-e2e/guided-pr",
        targetBranch: "main",
        headSha: "abc123",
        targetSha: "def456",
        remoteSourceSha: "abc123",
        remoteTargetSha: "def456",
        ahead: 2,
        behind: 0,
        changedFiles: ["BotToSharePoint/Claim.cs", "tests/ClaimTests.cs"],
      },
      workItem: { status: "available", item: { id: 7913, revision: 2 } },
      policies: { status: "available", targetRef: "refs/heads/main" },
      validation: { status: "not_run", sourceSha: "abc123" },
      suggestion: { title: "Handle claim retry outcome", readiness: "needs_attention" },
    });
    expect(deps.listBranchPolicies).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: "repo-guid",
      refName: "main",
    }));
    expect(preparation.suggestion.missingEvidence).toContain("Current-SHA validation has not passed yet.");
  });

  it("keeps ADO failures visible without discarding local Git evidence", async () => {
    const deps = dependencies();
    deps.listRepositories = vi.fn(async () => { throw new Error("authorization rejected"); });
    const preparation = await preparePullRequest({
      projectLink,
      preferences: { workItemId: 7913 },
      dependencies: deps,
    });

    expect(preparation.git.headSha).toBe("abc123");
    expect(preparation.policies).toMatchObject({ status: "failed" });
    expect(preparation.policies.message).toContain("authorization rejected");
    expect(preparation.workItem.status).toBe("failed");
    expect(preparation.suggestion.readiness).toBe("insufficient_evidence");
  });
});
