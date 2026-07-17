import { describe, expect, it } from "vitest";
import type { ReviewQueueItem } from "./api";
import { buildReviewAuditCardSummary, buildReviewAuditViewModel, dispositionLabel } from "./reviewAudit";

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
      at: "2026-06-11T00:01:02.000Z",
      ok: false,
      actor: "desktop-user",
      note: "Please address the Review Queue findings.",
      error: "createThread failed: HTTP 500: ADO unavailable",
      threadId: "",
      url: "",
    }, {
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

describe("review audit view model", () => {
  it("labels manual dispositions", () => {
    expect(dispositionLabel("changes_requested")).toBe("Changes requested");
    expect(dispositionLabel("marked_blocked")).toBe("Marked blocked");
    expect(dispositionLabel("")).toBe("");
  });

  it("builds summary and reversed event views", () => {
    const view = buildReviewAuditViewModel(queueItem());

    expect(view).toMatchObject({
      hasAudit: true,
      dispositionSummary: "Changes requested by desktop-user",
      dispositionAt: "2026-06-11T00:01:00.000Z",
      writeBackSummary: {
        statusLabel: "posted",
        ok: true,
        threadId: "123",
      },
    });
    expect(view.dispositionEvents).toEqual([{
      label: "Changes requested",
      at: "2026-06-11T00:01:00.000Z",
      actor: "desktop-user",
      note: "Please address the Review Queue findings.",
    }]);
    expect(view.writeBackAttempts.map((event) => event.statusLabel)).toEqual(["Posted", "Failed"]);
    expect(view.writeBackAttempts[0]).toMatchObject({
      ok: true,
      dispositionLabel: "Changes requested",
      threadId: "123",
    });
    expect(view.writeBackAttempts[1]).toMatchObject({
      ok: false,
      error: "createThread failed: HTTP 500: ADO unavailable",
    });
  });

  it("uses stable fallback text for missing actors", () => {
    const view = buildReviewAuditViewModel(queueItem({
      manualDispositionActor: "",
      manualDispositionEvents: [{
        disposition: "marked_blocked",
        at: "2026-06-11T00:03:00.000Z",
        actor: "",
        note: "Blocked manually.",
      }],
      manualDispositionWriteBackEvents: [{
        disposition: "marked_blocked",
        at: "2026-06-11T00:03:02.000Z",
        ok: false,
        actor: "",
        note: "Blocked manually.",
        error: "ADO failed",
        threadId: "",
        url: "",
      }],
    }));

    expect(view.dispositionSummary).toBe("Changes requested by actor not available");
    expect(view.dispositionEvents[0]?.actor).toBe("actor not available");
    expect(view.writeBackAttempts[0]?.actor).toBe("actor not available");
  });

  it("reports no audit when no disposition or write-back data exists", () => {
    const view = buildReviewAuditViewModel(queueItem({
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
    }));

    expect(view.hasAudit).toBe(false);
    expect(view.dispositionSummary).toBe("No manual disposition recorded");
    expect(view.writeBackSummary).toBeNull();
    expect(view.writeBackAttempts).toEqual([]);
  });

  it("builds compact card summaries for successful ADO write-back", () => {
    const summary = buildReviewAuditCardSummary(queueItem());

    expect(summary).toMatchObject({
      hasAudit: true,
      tone: "success",
      dispositionCount: 1,
      writeBackAttemptCount: 2,
      latestDispositionLabel: "Changes requested",
      latestWriteBackLabel: "ADO posted",
      threadId: "123",
    });
    expect(summary.label).toBe("Changes requested · ADO posted · 1 audit event · 2 write-back attempts");
  });

  it("builds warning card summaries for pending ADO write-back", () => {
    const summary = buildReviewAuditCardSummary(queueItem({
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "ADO unavailable",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: [{
        disposition: "changes_requested",
        at: "2026-06-11T00:02:02.000Z",
        ok: false,
        actor: "desktop-user",
        note: "Please address the Review Queue findings.",
        error: "ADO unavailable",
        threadId: "",
        url: "",
      }],
    }));

    expect(summary).toMatchObject({
      hasAudit: true,
      tone: "warning",
      writeBackAttemptCount: 1,
      latestWriteBackLabel: "ADO pending",
    });
    expect(summary.label).toContain("ADO pending");
  });

  it("builds neutral card summaries when only manual disposition exists", () => {
    const summary = buildReviewAuditCardSummary(queueItem({
      manualDispositionWriteBackAttempted: false,
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackAt: "",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: [],
    }));

    expect(summary).toMatchObject({
      hasAudit: true,
      tone: "neutral",
      dispositionCount: 1,
      writeBackAttemptCount: 0,
      latestDispositionLabel: "Changes requested",
      latestWriteBackLabel: "",
    });
  });

  it("builds empty card summaries when no manual audit exists", () => {
    const summary = buildReviewAuditCardSummary(queueItem({
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
    }));

    expect(summary).toMatchObject({
      hasAudit: false,
      label: "No manual audit",
      tone: "neutral",
      dispositionCount: 0,
      writeBackAttemptCount: 0,
    });
  });
});
