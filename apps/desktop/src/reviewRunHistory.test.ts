import { describe, expect, it } from "vitest";
import type { ReviewQueueItem, ReviewRunResult } from "./api";
import {
  applyReviewRunToQueueItem,
  isReviewQueueItemStale,
  reviewQueueFreshnessStatus,
  reviewQueueItemKey,
  staleReviewQueueItems,
} from "./reviewRunHistory";

function queueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    repository: "demo-repo",
    pullRequestId: 42,
    lastIterationId: 3,
    findingCount: 1,
    lastRunAt: "2026-06-11T00:00:00.000Z",
    sourceCommit: "abc123",
    decisionQueue: "blocked",
    decisionRiskLevel: "high",
    decisionReason: "Changes requested from Review Queue.",
    decisionReasonCodes: ["manual.changes_requested"],
    contextConfidence: "medium",
    autoApprovedAt: "",
    autoApprovalActor: "",
    discardedFindingCount: 0,
    hunkCoverageFiles: 1,
    wholeFileFallbackFiles: 0,
    changedHunkLines: 4,
    manualDisposition: "changes_requested",
    manualDispositionAt: "2026-06-11T00:01:00.000Z",
    manualDispositionActor: "desktop-user",
    manualDispositionNote: "Please address the Review Queue findings.",
    manualDispositionEvents: [{
      disposition: "changes_requested",
      at: "2026-06-11T00:01:00.000Z",
      actor: "desktop-user",
      note: "Please address the Review Queue findings.",
    }],
    manualDispositionWriteBackAttempted: true,
    manualDispositionWriteBackOk: true,
    manualDispositionWriteBackError: "",
    manualDispositionWriteBackAt: "2026-06-11T00:02:02.000Z",
    manualDispositionWriteBackThreadId: "123",
    manualDispositionWriteBackUrl: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
    manualDispositionWriteBackEvents: [{
      disposition: "changes_requested",
      at: "2026-06-11T00:02:02.000Z",
      ok: true,
      actor: "desktop-user",
      note: "Please address the Review Queue findings.",
      error: "",
      threadId: "123",
      url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
    }],
    ...overrides,
  };
}

function reviewRun(overrides: Partial<ReviewRunResult> = {}): ReviewRunResult {
  return {
    ok: true,
    pullRequestId: 42,
    repository: "demo-repo",
    iterationId: 4,
    findingCount: 2,
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    decisionReason: "Review Agent found warnings.",
    decisionReasonCodes: ["findings.warning"],
    contextConfidence: "high",
    lastRunAt: "2026-06-11T00:05:00.000Z",
    autoApprovalActor: "",
    tokensIn: 1000,
    tokensOut: 400,
    summary: "Review complete.",
    coverage: {
      totalFiles: 3,
      filesWithHunks: 2,
      wholeFileOnlyFiles: 1,
      hunkCount: 5,
      changedHunkLines: 18,
    },
    findings: [{
      file: "src/index.ts",
      line: 12,
      severity: "warning",
      category: "bug",
      message: "Possible issue.",
    }],
    discardedFindings: [{
      file: "src/index.ts",
      line: 2,
      severity: "info",
      category: "style",
      message: "Outside diff.",
      reason: "outside_changed_hunk",
    }],
    ...overrides,
  };
}

describe("applyReviewRunToQueueItem", () => {
  it("builds stable repository and PR keys", () => {
    expect(reviewQueueItemKey(queueItem())).toBe("demo-repo/42");
  });

  it("marks reviews stale when context confidence is missing", () => {
    const nowMs = Date.parse("2026-06-11T12:00:00.000Z");

    expect(isReviewQueueItemStale(queueItem({
      contextConfidence: "",
      lastRunAt: "2026-06-11T11:30:00.000Z",
    }), nowMs)).toBe(true);
    expect(reviewQueueFreshnessStatus(queueItem({
      contextConfidence: "",
      lastRunAt: "2026-06-11T11:30:00.000Z",
    }), nowMs)).toMatchObject({
      stale: true,
      label: "stale: missing confidence",
      reason: "missing_confidence",
    });
  });

  it("marks reviews stale when the last run is older than the configured age", () => {
    const nowMs = Date.parse("2026-06-11T12:00:00.000Z");

    expect(isReviewQueueItemStale(queueItem({
      contextConfidence: "high",
      lastRunAt: "2026-06-10T11:59:59.000Z",
    }), nowMs, 24)).toBe(true);
    expect(isReviewQueueItemStale(queueItem({
      contextConfidence: "high",
      lastRunAt: "2026-06-11T11:00:00.000Z",
    }), nowMs, 24)).toBe(false);
    expect(reviewQueueFreshnessStatus(queueItem({
      contextConfidence: "high",
      lastRunAt: "2026-06-10T11:59:59.000Z",
    }), nowMs, 24)).toMatchObject({
      stale: true,
      label: "stale: 24h old",
      reason: "age",
      ageHours: 24,
    });
    expect(reviewQueueFreshnessStatus(queueItem({
      contextConfidence: "high",
      lastRunAt: "2026-06-11T11:00:00.000Z",
    }), nowMs, 24)).toMatchObject({
      stale: false,
      label: "fresh: 1h old",
      reason: "fresh",
      ageHours: 1,
    });
  });

  it("selects only stale review queue items", () => {
    const nowMs = Date.parse("2026-06-11T12:00:00.000Z");
    const staleByAge = queueItem({
      repository: "old-repo",
      contextConfidence: "medium",
      lastRunAt: "2026-06-10T00:00:00.000Z",
    });
    const staleByConfidence = queueItem({
      repository: "missing-confidence",
      contextConfidence: "",
      lastRunAt: "2026-06-11T11:00:00.000Z",
    });
    const fresh = queueItem({
      repository: "fresh-repo",
      contextConfidence: "high",
      lastRunAt: "2026-06-11T11:00:00.000Z",
    });

    expect(staleReviewQueueItems([staleByAge, staleByConfidence, fresh], nowMs, 24).map(reviewQueueItemKey))
      .toEqual(["old-repo/42", "missing-confidence/42"]);
  });

  it("maps review-run decision and coverage fields onto the queue item", () => {
    const next = applyReviewRunToQueueItem(queueItem(), reviewRun());

    expect(next).toMatchObject({
      repository: "demo-repo",
      pullRequestId: 42,
      lastIterationId: 4,
      findingCount: 2,
      lastRunAt: "2026-06-11T00:05:00.000Z",
      sourceCommit: "abc123",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      decisionReason: "Review Agent found warnings.",
      decisionReasonCodes: ["findings.warning"],
      contextConfidence: "high",
      discardedFindingCount: 1,
      hunkCoverageFiles: 2,
      wholeFileFallbackFiles: 1,
      changedHunkLines: 18,
    });
  });

  it("preserves manual disposition and ADO write-back audit history", () => {
    const previous = queueItem();
    const next = applyReviewRunToQueueItem(previous, reviewRun());

    expect(next.manualDisposition).toBe("changes_requested");
    expect(next.manualDispositionAt).toBe("2026-06-11T00:01:00.000Z");
    expect(next.manualDispositionEvents).toEqual(previous.manualDispositionEvents);
    expect(next.manualDispositionWriteBackAttempted).toBe(true);
    expect(next.manualDispositionWriteBackOk).toBe(true);
    expect(next.manualDispositionWriteBackThreadId).toBe("123");
    expect(next.manualDispositionWriteBackUrl).toContain("discussionId=123");
    expect(next.manualDispositionWriteBackEvents).toEqual(previous.manualDispositionWriteBackEvents);
  });

  it("sets auto-approval audit fields only for auto-approved reruns", () => {
    const next = applyReviewRunToQueueItem(queueItem(), reviewRun({
      decisionQueue: "auto_approved",
      decisionRiskLevel: "low",
      autoApprovalActor: "review-agent",
    }));

    expect(next.autoApprovedAt).toBe("2026-06-11T00:05:00.000Z");
    expect(next.autoApprovalActor).toBe("review-agent");
  });

  it("clears stale auto-approval fields when a rerun needs human review", () => {
    const next = applyReviewRunToQueueItem(queueItem({
      autoApprovedAt: "2026-06-11T00:00:00.000Z",
      autoApprovalActor: "review-agent",
    }), reviewRun({
      decisionQueue: "needs_human_review",
      autoApprovalActor: "review-agent",
    }));

    expect(next.autoApprovedAt).toBe("");
    expect(next.autoApprovalActor).toBe("");
  });
});
