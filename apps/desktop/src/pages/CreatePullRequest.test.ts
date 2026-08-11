import { describe, expect, it } from "vitest";
import type { PullRequestPreparation } from "../api/delivery.js";
import { buildPullRequestActionProposal, DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES } from "./CreatePullRequest.js";

const preparation: PullRequestPreparation = {
  projectLinkId: "claimbot",
  repositoryId: "repo-guid",
  generatedAt: 1,
  git: {
    repoPath: "C:/work/ClaimBot_API",
    sourceBranch: "mergepilot-e2e/guided-pr",
    targetBranch: "main",
    headSha: "abc123",
    targetSha: "def456",
    remoteSourceSha: "abc123",
    remoteTargetSha: "def456",
    dirty: false,
    changedFiles: ["Claim.cs"],
    diffStat: "1 file changed",
    commits: [{ sha: "abc123", subject: "Handle claim retry" }],
    targetAvailability: "available",
  },
  validation: { status: "passed", summary: "tests passed", sourceSha: "abc123" },
  workItem: {
    status: "available",
    item: {
      id: 7913,
      revision: 4,
      type: "Task",
      title: "Handle claim retry",
      state: "Active",
      tags: [],
      relations: [],
      linkedPullRequests: [],
      linkedBuilds: [],
      testEvidence: [],
      comments: [],
    },
  },
  policies: { status: "available", targetRef: "refs/heads/main", configurations: [] },
  suggestion: {
    sourceBranch: "mergepilot-e2e/guided-pr",
    targetBranch: "main",
    title: "Handle claim retry",
    description: "Evidence-backed description",
    draft: false,
    workItemId: 7913,
    reviewerFocus: [],
    risks: [],
    missingEvidence: [],
    readiness: "ready",
  },
};

describe("Guided PR Preparation", () => {
  it("keeps branch and copy fields optional until real evidence is read", () => {
    expect(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES).toEqual({
      sourceBranch: "",
      targetBranch: "",
      title: "",
      description: "",
      workItemId: "",
    });
  });

  it("creates a typed, revision-bound PR ActionRecord preview", () => {
    const proposal = buildPullRequestActionProposal({
      preparation,
      sourceBranch: preparation.suggestion.sourceBranch,
      targetBranch: preparation.suggestion.targetBranch,
      title: "Edited title",
      description: "Edited description",
      workItemId: 7913,
      now: 1_786_000_000_000,
    });

    expect(proposal).toMatchObject({
      kind: "pull_request.create",
      projectLinkId: "claimbot",
      target: {
        kind: "pull_request",
        repositoryId: "repo-guid",
        id: 0,
        sourceCommit: "abc123",
      },
      payload: {
        sourceBranch: "mergepilot-e2e/guided-pr",
        targetBranch: "main",
        repositoryId: "repo-guid",
        title: "Edited title",
        description: "Edited description",
        workItemId: 7913,
      },
      risk: "high",
      expiresAt: 1_786_003_600_000,
    });
    expect(proposal.basedOn).toEqual([
      { kind: "branch", projectLinkId: "claimbot", repositoryId: "repo-guid", name: "mergepilot-e2e/guided-pr", objectId: "abc123" },
      { kind: "branch", projectLinkId: "claimbot", repositoryId: "repo-guid", name: "main", objectId: "def456" },
      { kind: "work_item", projectLinkId: "claimbot", id: 7913, revision: 4 },
    ]);
    expect(proposal.expectedResult).toEqual([
      { artifact: proposal.target, condition: "exists" },
      { artifact: proposal.target, condition: "field_contains", field: "workItemIds", expected: ["7913"] },
    ]);
  });

  it("refuses to relabel revision evidence after preparation", () => {
    expect(() => buildPullRequestActionProposal({
      preparation,
      sourceBranch: "another-branch",
      targetBranch: "main",
      title: "Edited title",
      description: "Edited description",
      workItemId: 7913,
      now: 1,
    })).toThrow("Branch fields changed after evidence was read");

    expect(() => buildPullRequestActionProposal({
      preparation,
      sourceBranch: "mergepilot-e2e/guided-pr",
      targetBranch: "main",
      title: "Edited title",
      description: "Edited description",
      workItemId: 9999,
      now: 1,
    })).toThrow("Work Item changed after evidence was read");
  });
});
