import { describe, expect, it } from "vitest";
import { buildPullRequestPreparation } from "../src/delivery/pullRequestPreparation.js";

const git = {
  repoPath: "C:/work/ClaimBot_API",
  sourceBranch: "mergepilot-e2e/guided-pr",
  targetBranch: "main",
  headSha: "abc123",
  targetSha: "def456",
  remoteSourceSha: "abc123",
  remoteTargetSha: "def456",
  upstream: "origin/mergepilot-e2e/guided-pr",
  ahead: 2,
  behind: 0,
  dirty: false,
  changedFiles: ["BotToSharePoint/Controllers/ClaimController.cs", "tests/ClaimControllerTests.cs"],
  diffStat: "2 files changed, 24 insertions(+), 3 deletions(-)",
  commits: [
    { sha: "abc123", subject: "Handle claim retry outcome" },
    { sha: "abc122", subject: "Cover failed claim retry" },
  ],
  targetAvailability: "available" as const,
};

const workItem = {
  status: "available" as const,
  item: {
    id: 7913,
    revision: 4,
    type: "User Story",
    title: "Handle claim retry outcome",
    state: "Active",
    description: "Make retry outcomes visible to operators.",
    acceptanceCriteria: "A failed retry is reported without losing the claim identifier.",
    tags: ["MergePilot Fixture"],
    assignedTo: "Ada",
    relations: [],
    linkedPullRequests: [],
    linkedBuilds: [],
    testEvidence: [],
    comments: [],
  },
};

describe("buildPullRequestPreparation", () => {
  it("builds an editable suggestion only from supplied evidence", () => {
    const preparation = buildPullRequestPreparation({
      projectLinkId: "claimbot",
      repositoryId: "repo-guid",
      git,
      validation: { status: "passed", summary: "dotnet test passed", sourceSha: "abc123" },
      workItem,
      policies: {
        status: "available",
        targetRef: "refs/heads/main",
        configurations: [{
          id: 1,
          revision: 2,
          typeId: "reviewers",
          displayName: "Minimum reviewers",
          isEnabled: true,
          isBlocking: true,
        }],
      },
      generatedAt: 1_786_000_000_000,
    });

    expect(preparation.suggestion).toMatchObject({
      sourceBranch: "mergepilot-e2e/guided-pr",
      targetBranch: "main",
      title: "Handle claim retry outcome",
      workItemId: 7913,
      readiness: "needs_attention",
    });
    expect(preparation.suggestion.description).toContain("Make retry outcomes visible to operators.");
    expect(preparation.suggestion.description).toContain("Validation: dotnet test passed");
    expect(preparation.suggestion.description).toContain("Minimum reviewers (blocking)");
    expect(preparation.suggestion.reviewerFocus).toContain("Verify the Work Item acceptance criteria against the changed behavior.");
    expect(preparation.suggestion.risks).toEqual(["The target branch has 1 blocking policy requirement."]);
    expect(preparation.generatedAt).toBe(1_786_000_000_000);
  });

  it("never turns missing or failed reads into a ready suggestion", () => {
    const preparation = buildPullRequestPreparation({
      projectLinkId: "claimbot",
      repositoryId: "repo-guid",
      git: { ...git, dirty: true, targetAvailability: "failed" },
      validation: { status: "not_run", summary: "No current-SHA validation has been run." },
      workItem: { status: "missing", message: "Work Item 999 was not found." },
      policies: {
        status: "failed",
        targetRef: "refs/heads/main",
        configurations: [],
        message: "ADO branch policy read failed.",
      },
    });

    expect(preparation.suggestion.readiness).toBe("insufficient_evidence");
    expect(preparation.suggestion.missingEvidence).toEqual(expect.arrayContaining([
      "The target branch revision is not available in the local repository.",
      "Current-SHA validation has not passed yet.",
      "Work Item 999 was not found.",
      "ADO branch policy read failed.",
    ]));
    expect(preparation.suggestion.risks).toContain("The working tree has uncommitted changes that are not part of the proposed PR.");
  });

  it("blocks a same-branch proposal even when other evidence is present", () => {
    const preparation = buildPullRequestPreparation({
      projectLinkId: "claimbot",
      repositoryId: "repo-guid",
      git: { ...git, sourceBranch: "main" },
      validation: { status: "passed", summary: "tests passed", sourceSha: "abc123" },
      workItem,
      policies: { status: "available", targetRef: "refs/heads/main", configurations: [] },
    });

    expect(preparation.suggestion.readiness).toBe("blocked");
    expect(preparation.suggestion.risks).toContain("Source and target branches are the same.");
  });
});
