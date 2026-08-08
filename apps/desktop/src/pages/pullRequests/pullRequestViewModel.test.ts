import { describe, expect, it } from "vitest";
import {
  dedupePullRequests,
  formatDate,
  matchesProjectLinkBranch,
  mergeInsightArtifacts,
  previewOperationDetails,
  prInsightArtifactsCacheKey,
  projectLinkPullRequestCacheKey,
  prMatchesCategory,
  readiness,
} from "./pullRequestViewModel.js";
import type { PullRequestInsightPreview } from "../../api.js";
import type { DisplayPullRequest } from "./pullRequestTypes.js";

function pr(overrides: Partial<DisplayPullRequest> = {}): DisplayPullRequest {
  return {
    id: 1,
    title: "PR",
    repository: "repo",
    sourceBranch: "feature/a",
    targetBranch: "main",
    status: "active",
    isDraft: false,
    creationDate: "2026-01-01T00:00:00.000Z",
    createdBy: "user",
    reviewerCount: 1,
    reviewers: ["Reviewer Name"],
    voteSummary: {
      approved: 0,
      rejected: 0,
      waiting: 1,
    },
    url: "",
    ...overrides,
  };
}

describe("pullRequestViewModel", () => {
  it("does not surface invalid date strings", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });

  it("uses explicit unavailable wording for missing preview operation fields", () => {
    const details = previewOperationDetails({
      source: "heuristic",
      summary: "No model response.",
      risks: [],
      signals: {
        fileCount: 2,
        threadCount: 0,
        failedBuildCount: 0,
        workItemCount: 0,
      },
      tokensIn: 12,
      tokensOut: 8,
    } satisfies PullRequestInsightPreview);

    expect(details).toContain("readiness=not available");
    expect(details).not.toContain("unknown");
  });


  it("deduplicates pull requests by Project Link, repository, and id", () => {
    expect(dedupePullRequests([
      pr({ id: 1, repository: "repo", sourceProjectLinkId: "a", title: "first" }),
      pr({ id: 1, repository: "repo", sourceProjectLinkId: "a", title: "duplicate" }),
      pr({ id: 1, repository: "repo", sourceProjectLinkId: "b", title: "same repo in another Project Link" }),
      pr({ id: 1, repository: "other", sourceProjectLinkId: "a", title: "other repo" }),
    ])).toHaveLength(3);
  });

  it("filters pull requests by product categories", () => {
    expect(prMatchesCategory(pr({ isDraft: true }), "waiting")).toBe(true);
    expect(prMatchesCategory(pr({ voteSummary: { approved: 0, rejected: 0, waiting: 1 } }), "waiting")).toBe(true);
    expect(prMatchesCategory(pr({ createdBy: "Author Name", reviewers: [] }), "mine", "Author Name")).toBe(true);
    expect(prMatchesCategory(pr({ createdBy: "Author Name", reviewers: [] }), "mine", "Someone Else")).toBe(false);
    expect(prMatchesCategory(pr({ reviewers: ["Reviewer Name"] }), "needs_review", "Reviewer Name")).toBe(true);
    expect(prMatchesCategory(pr({ reviewers: ["Other Reviewer"] }), "needs_review", "Reviewer Name")).toBe(false);
    expect(prMatchesCategory(pr({ voteSummary: { approved: 1, rejected: 0, waiting: 0 } }), "all")).toBe(true);
  });

  it("matches the Project Link branch scope unless the scope is main or empty", () => {
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "refs/heads/feature/a" }), { defaultBranch: "feature/a" })).toBe(true);
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "feature/b" }), { defaultBranch: "feature/a" })).toBe(false);
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "feature/b" }), { defaultBranch: "main" })).toBe(true);
  });

  it("keys pull request cache by Project Link mapping fields, not only id", () => {
    const base = {
      id: "pl-1",
      repoPath: "C:\\repo",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      defaultBranch: "feature/a",
      targetBranch: "main",
      updatedAt: 1,
    };

    expect(projectLinkPullRequestCacheKey([base])).not.toBe(
      projectLinkPullRequestCacheKey([{ ...base, defaultBranch: "feature/b" }]),
    );
    expect(projectLinkPullRequestCacheKey([base])).not.toBe(
      projectLinkPullRequestCacheKey([{ ...base, adoRepoName: "OtherRepo" }]),
    );
    expect(projectLinkPullRequestCacheKey([base, { ...base, id: "pl-2" }])).toBe(
      projectLinkPullRequestCacheKey([{ ...base, id: "pl-2" }, base]),
    );
  });

  it("keys PR insight artifacts by the same Project Link mapping scope", () => {
    const base = {
      id: "pl-1",
      repoPath: "C:\\repo",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      defaultBranch: "feature/a",
      targetBranch: "main",
      updatedAt: 1,
    };
    const originalScope = projectLinkPullRequestCacheKey([base]);
    const changedRepoScope = projectLinkPullRequestCacheKey([
      { ...base, adoRepoName: "OtherRepo" },
    ]);
    const changedBranchScope = projectLinkPullRequestCacheKey([
      { ...base, defaultBranch: "feature/b" },
    ]);

    expect(prInsightArtifactsCacheKey(base.id, originalScope)).not.toEqual(
      prInsightArtifactsCacheKey(base.id, changedRepoScope),
    );
    expect(prInsightArtifactsCacheKey(base.id, originalScope)).not.toEqual(
      prInsightArtifactsCacheKey(base.id, changedBranchScope),
    );
  });

  it("maps readiness from draft, rejected, approved, and waiting votes", () => {
    expect(readiness(pr({ isDraft: true })).label).toBe("Draft");
    expect(readiness(pr({ voteSummary: { approved: 0, rejected: 1, waiting: 0 } })).label).toBe("Changes requested");
    expect(readiness(pr({ voteSummary: { approved: 1, rejected: 0, waiting: 0 } })).label).toBe("Reviewed");
    expect(readiness(pr()).label).toBe("Needs review");
  });

  it("keeps the newest unique insight artifact per id", () => {
    const merged = mergeInsightArtifacts([
      { id: "a", projectLinkId: "p", repository: "r", pullRequestId: 1, title: "old", kind: "insight_preview", at: "2026-01-01T00:00:00Z", summary: "", readiness: "ready", risks: [], tokensIn: 0, tokensOut: 0 },
      { id: "b", projectLinkId: "p", repository: "r", pullRequestId: 1, title: "new", kind: "insight_preview", at: "2026-01-03T00:00:00Z", summary: "", readiness: "ready", risks: [], tokensIn: 0, tokensOut: 0 },
      { id: "a", projectLinkId: "p", repository: "r", pullRequestId: 1, title: "duplicate", kind: "insight_preview", at: "2026-01-02T00:00:00Z", summary: "", readiness: "ready", risks: [], tokensIn: 0, tokensOut: 0 },
    ]);

    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
