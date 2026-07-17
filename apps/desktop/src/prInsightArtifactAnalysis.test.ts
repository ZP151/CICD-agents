import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestInsightPreview, ReviewRunResult } from "./api";
import {
  clearPrInsightArtifacts,
  comparePrInsightArtifacts,
  prInsightArtifactFreshness,
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
    discardedFindings: [],
    ...overrides,
  };
}

describe("PR insight artifact analysis", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    clearPrInsightArtifacts();
    vi.unstubAllGlobals();
  });

  it("compares preview and full review artifacts for the same PR", () => {
    const previewArtifact = savePrInsightPreviewArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: preview({
        readiness: "ready",
        risks: ["Small PR"],
        tokensIn: 100,
        tokensOut: 20,
      }),
      at: "2026-06-11T00:00:00.000Z",
    });
    const reviewArtifact = savePrReviewRunArtifact({
      projectLinkId: "project-link-1",
      repository: "demo-repo",
      pullRequestId: 42,
      title: "Improve pipeline",
      result: reviewRun({
        readiness: "needs_attention",
        categories: {
          blocking: [],
          warnings: ["Missing tests"],
          info: [],
        },
        findingCount: 3,
        tokensIn: 1000,
        tokensOut: 300,
      }),
    });

    expect(comparePrInsightArtifacts(previewArtifact, reviewArtifact)).toMatchObject({
      readinessChanged: true,
      previewReadiness: "ready",
      reviewReadiness: "needs_attention",
      addedRisks: ["Missing tests"],
      resolvedRisks: ["Small PR"],
      tokenDelta: 1180,
    });
  });

  it("classifies saved insight freshness against the current PR baseline", () => {
    expect(
      prInsightArtifactFreshness(
        {
          iterationId: 5,
          sourceCommit: "abc123",
        },
        {
          iterationId: 5,
          sourceCommit: "abc123",
        },
      ),
    ).toMatchObject({
      state: "fresh",
      reasons: [],
    });

    expect(
      prInsightArtifactFreshness(
        {
          iterationId: 5,
          sourceCommit: "abc123",
        },
        {
          iterationId: 6,
          sourceCommit: "def456",
        },
      ),
    ).toMatchObject({
      state: "stale",
      reasons: ["iteration_changed", "source_commit_changed"],
    });

    expect(
      prInsightArtifactFreshness(
        {},
        {
          iterationId: 6,
          sourceCommit: "def456",
        },
      ),
    ).toMatchObject({
      state: "unknown",
      reasons: ["missing_baseline"],
      label: "freshness not available: no saved PR baseline",
    });
  });
});
