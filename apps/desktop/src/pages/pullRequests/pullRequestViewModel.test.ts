import { describe, expect, it } from "vitest";
import {
  dedupePullRequests,
  matchesProjectLinkBranch,
  mergeInsightArtifacts,
  prMatchesCategory,
  readiness,
} from "./pullRequestViewModel.js";
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
  it("deduplicates pull requests by repository and id", () => {
    expect(dedupePullRequests([
      pr({ id: 1, repository: "repo", title: "first" }),
      pr({ id: 1, repository: "repo", title: "duplicate" }),
      pr({ id: 1, repository: "other", title: "other repo" }),
    ])).toHaveLength(2);
  });

  it("filters pull requests by product categories", () => {
    expect(prMatchesCategory(pr({ isDraft: true }), "draft")).toBe(true);
    expect(prMatchesCategory(pr({ voteSummary: { approved: 1, rejected: 0, waiting: 0 } }), "reviewed")).toBe(true);
    expect(prMatchesCategory(pr({ voteSummary: { approved: 0, rejected: 0, waiting: 1 } }), "attention")).toBe(true);
  });

  it("matches the Project Link branch scope unless the scope is main or empty", () => {
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "refs/heads/feature/a" }), { defaultBranch: "feature/a" })).toBe(true);
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "feature/b" }), { defaultBranch: "feature/a" })).toBe(false);
    expect(matchesProjectLinkBranch(pr({ sourceBranch: "feature/b" }), { defaultBranch: "main" })).toBe(true);
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
