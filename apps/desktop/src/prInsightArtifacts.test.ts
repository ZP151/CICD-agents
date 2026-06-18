import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestInsightPreview, ReviewRunResult } from "./api";
import {
  PR_INSIGHT_ARTIFACTS_LS_KEY,
  clearPrInsightArtifacts,
  latestPrInsightArtifact,
  listPrInsightArtifacts,
  prInsightArtifactProjectLinkId,
  savePrInsightPreviewArtifact,
  savePrReviewRunArtifact,
} from "./prInsightArtifacts";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

function preview(overrides: Partial<PullRequestInsightPreview> = {}): PullRequestInsightPreview {
  return {
    source: "heuristic",
    summary: "Preview summary.",
    readiness: "needs_attention",
    risks: ["Missing tests"],
    categories: {
      blocking: [],
      warnings: ["Missing tests"],
      info: ["Small PR"],
    },
    signals: {
      fileCount: 3,
      threadCount: 2,
      failedBuildCount: 1,
      workItemCount: 1,
      failedPolicyCount: 1,
      policyBlockers: [{
        id: "policy-1",
        name: "Minimum reviewers",
        typeName: "Reviewer policy",
        status: "failed",
        isBlocking: true,
      }],
      linkedWorkItems: [{
        id: 123,
        type: "User Story",
        title: "Improve agent insight",
        state: "Active",
        url: "https://ado/workItems/123",
      }],
    },
    tokensIn: 100,
    tokensOut: 20,
    ...overrides,
  };
}

function reviewRun(overrides: Partial<ReviewRunResult> = {}): ReviewRunResult {
  return {
    ok: true,
    pullRequestId: 42,
    repository: "demo-repo",
    iterationId: 5,
    findingCount: 2,
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    decisionReason: "Review Agent found warnings.",
    decisionReasonCodes: ["findings.warning"],
    contextConfidence: "high",
    readiness: "needs_attention",
    categories: {
      blocking: [],
      warnings: ["Missing tests"],
      info: ["Small PR"],
    },
    lastRunAt: "2026-06-11T00:10:00.000Z",
    autoApprovalActor: "",
    tokensIn: 1000,
    tokensOut: 300,
    summary: "Full review summary.",
    discardedFindings: [{
      file: "src/index.ts",
      line: 1,
      severity: "info",
      category: "style",
      message: "Outside changed hunk.",
      reason: "outside_changed_hunk",
    }],
    ...overrides,
  };
}

describe("PR insight artifacts", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    clearPrInsightArtifacts();
    vi.unstubAllGlobals();
  });

  it("saves preview artifacts and returns the latest artifact for a PR", () => {
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview(),
      at: "2026-06-11T00:00:00.000Z",
    });

    expect(latestPrInsightArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
    })).toMatchObject({
      projectLinkId: "project-link-1",
      kind: "insight_preview",
      summary: "Preview summary.",
      readiness: "needs_attention",
      signals: {
        fileCount: 3,
        failedBuildCount: 1,
        failedPolicyCount: 1,
        policyBlockers: [{
          name: "Minimum reviewers",
          status: "failed",
        }],
      },
    });
  });

  it("reads artifacts through Project Link identity", () => {
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview(),
      at: "2026-06-11T00:00:00.000Z",
    });

    const artifacts = listPrInsightArtifacts("project-link-1");
    expect(artifacts).toHaveLength(1);
    const artifact = artifacts[0]!;
    expect(prInsightArtifactProjectLinkId(artifact)).toBe("project-link-1");
  });

  it("stores newer full review artifacts ahead of older previews", () => {
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview(),
      at: "2026-06-11T00:00:00.000Z",
    });
    savePrReviewRunArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: reviewRun(),
    });

    const artifacts = listPrInsightArtifacts("project-link-1");
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["review_run", "insight_preview"]);
    expect(artifacts[0]).toMatchObject({
      summary: "Full review summary.",
      iterationId: 5,
      findingCount: 2,
      discardedFindingCount: 1,
      decisionRiskLevel: "medium",
    });
  });

  it("filters artifacts by Project Link and ignores corrupt storage", () => {
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview(),
    });
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-2",
      repository: "demo-repo",
      pullRequestId: 43,
      title: "Other PR",
      result: preview({ summary: "Other summary." }),
    });

    expect(listPrInsightArtifacts("project-link-1")).toHaveLength(1);

    localStorage.setItem(PR_INSIGHT_ARTIFACTS_LS_KEY, "{not-json");
    expect(listPrInsightArtifacts()).toEqual([]);
  });

  it("preserves refreshed artifacts as separate history entries", () => {
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview({ summary: "Old summary." }),
      at: "2026-06-11T00:00:00.000Z",
    });
    savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview({ summary: "New summary." }),
      at: "2026-06-11T00:01:00.000Z",
    });

    const artifacts = listPrInsightArtifacts("project-link-1");
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.summary)).toEqual(["New summary.", "Old summary."]);
    expect(latestPrInsightArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
    })).toMatchObject({ summary: "New summary." });
  });

});
