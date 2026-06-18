import { describe, expect, it } from "vitest";
import type { ReviewQueueItem } from "../../api.js";
import {
  buildRetryDispositionWriteBackUpdate,
  buildManualDispositionUpdate,
  isSameReviewQueueItem,
  normalizeStaleAgeHours,
  replaceReviewQueueItem,
  replaceSelectedReviewQueueItem,
  requiresDispositionWriteBack,
} from "./reviewQueueRuntime.js";

function queueItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    repository: "ClaimBot_API",
    pullRequestId: 2670,
    lastIterationId: 3,
    findingCount: 2,
    lastRunAt: "2026-06-18T00:00:00Z",
    sourceCommit: "abcdef123456",
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    decisionReason: "Two findings need review.",
    decisionReasonCodes: ["findings_present"],
    contextConfidence: "high",
    autoApprovedAt: "",
    autoApprovalActor: "",
    discardedFindingCount: 0,
    hunkCoverageFiles: 2,
    wholeFileFallbackFiles: 0,
    changedHunkLines: 12,
    manualDisposition: "",
    manualDispositionAt: "",
    manualDispositionActor: "",
    manualDispositionNote: "",
    manualDispositionEvents: [],
    manualDispositionWriteBackAttempted: false,
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "",
    manualDispositionWriteBackAt: "",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: [],
    ...overrides,
  };
}

describe("reviewQueueRuntime", () => {
  it("normalizes stale review age settings", () => {
    expect(normalizeStaleAgeHours(12.4)).toBe(12);
    expect(normalizeStaleAgeHours(12.5)).toBe(13);
    expect(normalizeStaleAgeHours(0)).toBe(24);
    expect(normalizeStaleAgeHours(-5)).toBe(24);
    expect(normalizeStaleAgeHours(Number.NaN)).toBe(24);
  });

  it("identifies dispositions that require Azure DevOps write-back", () => {
    expect(requiresDispositionWriteBack("marked_blocked")).toBe(true);
    expect(requiresDispositionWriteBack("changes_requested")).toBe(true);
    expect(requiresDispositionWriteBack("acknowledged")).toBe(false);
    expect(requiresDispositionWriteBack("marked_safe")).toBe(false);
    expect(requiresDispositionWriteBack("")).toBe(false);
  });

  it("builds acknowledged updates without changing queue risk", () => {
    const updated = buildManualDispositionUpdate(queueItem(), "acknowledged", {
      actor: "desktop-user",
      now: "2026-06-18T01:00:00Z",
    });

    expect(updated.manualDisposition).toBe("acknowledged");
    expect(updated.manualDispositionNote).toBe("Acknowledged");
    expect(updated.manualDispositionEvents).toHaveLength(1);
    expect(updated.manualDispositionWriteBackAttempted).toBe(false);
    expect(updated.decisionQueue).toBe("needs_human_review");
    expect(updated.decisionRiskLevel).toBe("medium");
    expect(updated.decisionReason).toContain("Acknowledged by desktop-user.");
  });

  it("builds safe updates as low-risk auto-approved queue items", () => {
    const updated = buildManualDispositionUpdate(queueItem(), "marked_safe", {
      actor: "desktop-user",
      now: "2026-06-18T01:00:00Z",
    });

    expect(updated.manualDisposition).toBe("marked_safe");
    expect(updated.manualDispositionWriteBackAttempted).toBe(false);
    expect(updated.decisionQueue).toBe("auto_approved");
    expect(updated.decisionRiskLevel).toBe("low");
    expect(updated.decisionReason).toBe("Manually marked safe in Review Queue.");
  });

  it("builds blocked updates with pending write-back state", () => {
    const updated = buildManualDispositionUpdate(
      queueItem({
        manualDispositionWriteBackOk: true,
        manualDispositionWriteBackError: "old error",
        manualDispositionWriteBackAt: "2026-06-17T00:00:00Z",
        manualDispositionWriteBackThreadId: "old-thread",
        manualDispositionWriteBackUrl: "https://example.test/thread",
      }),
      "changes_requested",
      {
        actor: "desktop-user",
        now: "2026-06-18T01:00:00Z",
      },
    );

    expect(updated.manualDisposition).toBe("changes_requested");
    expect(updated.manualDispositionNote).toBe("Changes requested");
    expect(updated.manualDispositionWriteBackAttempted).toBe(true);
    expect(updated.manualDispositionWriteBackOk).toBe(false);
    expect(updated.manualDispositionWriteBackError).toBe("");
    expect(updated.manualDispositionWriteBackAt).toBe("");
    expect(updated.manualDispositionWriteBackThreadId).toBe("");
    expect(updated.manualDispositionWriteBackUrl).toBe("");
    expect(updated.decisionQueue).toBe("blocked");
    expect(updated.decisionRiskLevel).toBe("high");
    expect(updated.decisionReason).toBe("Changes requested from Review Queue.");
  });

  it("builds retry write-back updates by clearing stale result fields", () => {
    const updated = buildRetryDispositionWriteBackUpdate(
      queueItem({
        manualDisposition: "marked_blocked",
        manualDispositionWriteBackOk: true,
        manualDispositionWriteBackError: "old error",
        manualDispositionWriteBackAt: "2026-06-17T00:00:00Z",
        manualDispositionWriteBackThreadId: "old-thread",
        manualDispositionWriteBackUrl: "https://example.test/thread",
        manualDispositionWriteBackEvents: [
          {
            disposition: "marked_blocked",
            at: "2026-06-17T00:00:00Z",
            ok: false,
            actor: "desktop-user",
            note: "old",
            error: "old error",
            threadId: "old-thread",
            url: "https://example.test/thread",
          },
        ],
      }),
    );

    expect(updated.manualDispositionWriteBackAttempted).toBe(true);
    expect(updated.manualDispositionWriteBackOk).toBe(false);
    expect(updated.manualDispositionWriteBackError).toBe("");
    expect(updated.manualDispositionWriteBackAt).toBe("");
    expect(updated.manualDispositionWriteBackThreadId).toBe("");
    expect(updated.manualDispositionWriteBackUrl).toBe("");
    expect(updated.manualDispositionWriteBackEvents).toHaveLength(1);
  });

  it("replaces matching queue items and selected item only", () => {
    const first = queueItem({ repository: "repo-a", pullRequestId: 1 });
    const second = queueItem({ repository: "repo-b", pullRequestId: 2 });
    const replacement = queueItem({
      repository: "repo-b",
      pullRequestId: 2,
      decisionQueue: "blocked",
    });

    expect(isSameReviewQueueItem(second, replacement)).toBe(true);
    expect(isSameReviewQueueItem(first, replacement)).toBe(false);
    expect(replaceReviewQueueItem([first, second], second, replacement)).toEqual([
      first,
      replacement,
    ]);
    expect(replaceSelectedReviewQueueItem(second, second, replacement)).toBe(replacement);
    expect(replaceSelectedReviewQueueItem(first, second, replacement)).toBe(first);
  });
});
