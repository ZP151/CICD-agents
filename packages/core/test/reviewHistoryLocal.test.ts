import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listLocalReviewHistory,
  reviewHistoryStorePath,
  upsertLocalReviewHistory,
} from "../src/reviewHistoryLocal.js";
import { getReviewQueuePriority, type ReviewQueueItem } from "../src/reviewQueue.js";

describe("reviewHistoryLocal", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-review-history-"));

  afterEach(() => {
    const p = reviewHistoryStorePath(dataDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("upserts and lists records by repository", () => {
    upsertLocalReviewHistory(dataDir, {
      repository: "demo-repo",
      pullRequestId: 42,
      lastIterationId: 3,
      findingCount: 1,
      lastRunAt: "2026-06-01T12:00:00.000Z",
      sourceCommit: "abc123",
      decisionQueue: "auto_approved",
      decisionRiskLevel: "low",
      decisionReason: "Low-risk PR passed auto-approval policy.",
      autoApprovedAt: "2026-06-01T12:00:01.000Z",
      autoApprovalActor: "review-bot",
      discardedFindingCount: 2,
      hunkCoverageFiles: 3,
      wholeFileFallbackFiles: 1,
      changedHunkLines: 12,
      decisionReasonCodes: ["auto_approval.eligible"],
      contextConfidence: "high",
      manualDisposition: "acknowledged",
      manualDispositionAt: "2026-06-01T12:05:00.000Z",
      manualDispositionActor: "desktop-user",
      manualDispositionNote: "Acknowledged",
      manualDispositionEvents: [{
        disposition: "acknowledged",
        at: "2026-06-01T12:05:00.000Z",
        actor: "desktop-user",
        note: "Acknowledged",
      }],
      manualDispositionWriteBackAttempted: true,
      manualDispositionWriteBackOk: true,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "2026-06-01T12:05:02.000Z",
      manualDispositionWriteBackThreadId: "123",
      manualDispositionWriteBackUrl: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
      manualDispositionWriteBackEvents: [{
        disposition: "acknowledged",
        at: "2026-06-01T12:05:02.000Z",
        ok: true,
        actor: "desktop-user",
        note: "Acknowledged",
        error: "",
        threadId: "123",
        url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
      }],
    });

    const items = listLocalReviewHistory({ dataDir, repository: "demo-repo" });
    expect(items).toHaveLength(1);
    expect(items[0]?.pullRequestId).toBe(42);
    expect(items[0]?.decisionQueue).toBe("auto_approved");
    expect(items[0]).toMatchObject({
      discardedFindingCount: 2,
      hunkCoverageFiles: 3,
      wholeFileFallbackFiles: 1,
      changedHunkLines: 12,
      decisionReasonCodes: ["auto_approval.eligible"],
      contextConfidence: "high",
      manualDisposition: "acknowledged",
      manualDispositionAt: "2026-06-01T12:05:00.000Z",
      manualDispositionActor: "desktop-user",
      manualDispositionNote: "Acknowledged",
      manualDispositionEvents: [{
        disposition: "acknowledged",
        at: "2026-06-01T12:05:00.000Z",
        actor: "desktop-user",
        note: "Acknowledged",
      }],
      manualDispositionWriteBackAttempted: true,
      manualDispositionWriteBackOk: true,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "2026-06-01T12:05:02.000Z",
      manualDispositionWriteBackThreadId: "123",
      manualDispositionWriteBackUrl: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
      manualDispositionWriteBackEvents: [{
        disposition: "acknowledged",
        at: "2026-06-01T12:05:02.000Z",
        ok: true,
        actor: "desktop-user",
        note: "Acknowledged",
        error: "",
        threadId: "123",
        url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
      }],
    });
  });

  it("orders queue history by review attention priority before recency", () => {
    upsertLocalReviewHistory(dataDir, {
      repository: "demo-repo",
      pullRequestId: 1,
      lastIterationId: 1,
      findingCount: 0,
      lastRunAt: "2026-06-01T12:00:00.000Z",
      sourceCommit: "abc123",
      decisionQueue: "auto_approved",
      decisionRiskLevel: "low",
      decisionReason: "Low-risk PR passed auto-approval policy.",
      decisionReasonCodes: ["auto_approval.eligible"],
      contextConfidence: "high",
      autoApprovedAt: "2026-06-01T12:00:01.000Z",
      autoApprovalActor: "review-bot",
    });
    upsertLocalReviewHistory(dataDir, {
      repository: "demo-repo",
      pullRequestId: 2,
      lastIterationId: 1,
      findingCount: 1,
      lastRunAt: "2026-05-01T12:00:00.000Z",
      sourceCommit: "def456",
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      decisionReason: "Blocking finding requires attention.",
      decisionReasonCodes: ["risk.high", "context.no_hunk_coverage"],
      contextConfidence: "low",
      autoApprovedAt: "",
      autoApprovalActor: "",
      discardedFindingCount: 3,
      hunkCoverageFiles: 0,
      wholeFileFallbackFiles: 2,
      changedHunkLines: 0,
    });

    const items = listLocalReviewHistory({ dataDir, repository: "demo-repo" });
    expect(items.map((item) => item.pullRequestId)).toEqual([2, 1]);
  });

  it("explains review queue attention priority", () => {
    const item: ReviewQueueItem = {
      repository: "demo-repo",
      pullRequestId: 3,
      lastIterationId: 1,
      findingCount: 2,
      lastRunAt: "2026-06-01T12:00:00.000Z",
      sourceCommit: "abc123",
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      decisionReason: "Blocking finding requires attention.",
      decisionReasonCodes: ["risk.high", "context.no_hunk_coverage"],
      contextConfidence: "low",
      autoApprovedAt: "",
      autoApprovalActor: "",
      discardedFindingCount: 1,
      hunkCoverageFiles: 0,
      wholeFileFallbackFiles: 2,
      changedHunkLines: 0,
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
    };

    expect(getReviewQueuePriority(item)).toMatchObject({
      reasons: expect.arrayContaining([
        "blocked queue",
        "high risk",
        "2 finding(s)",
        "1 discarded finding(s)",
        "2 whole-file fallback file(s)",
        "no hunk coverage",
      ]),
    });
  });
});
