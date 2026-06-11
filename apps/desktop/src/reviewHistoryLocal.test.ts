import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewQueueItem } from "./api";
import {
  listReviewHistoryLocal,
  mergeReviewQueueItems,
  REVIEW_HISTORY_LS_KEY,
  syncReviewHistoryLocal,
  upsertReviewHistoryLocal,
} from "./reviewHistoryLocal";

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
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "createThread failed: HTTP 500: ADO unavailable",
    manualDispositionWriteBackAt: "2026-06-11T00:01:02.000Z",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: [{
      disposition: "changes_requested",
      at: "2026-06-11T00:01:02.000Z",
      ok: false,
      actor: "desktop-user",
      note: "Please address the Review Queue findings.",
      error: "createThread failed: HTTP 500: ADO unavailable",
      threadId: "",
      url: "",
    }],
    ...overrides,
  };
}

describe("reviewHistoryLocal", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("persists write-back attempt events in browser review history", () => {
    upsertReviewHistoryLocal(queueItem());

    const items = listReviewHistoryLocal("demo-repo");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      pullRequestId: 42,
      manualDispositionWriteBackAttempted: true,
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "createThread failed: HTTP 500: ADO unavailable",
      manualDispositionWriteBackEvents: [{
        disposition: "changes_requested",
        ok: false,
        actor: "desktop-user",
        error: "createThread failed: HTTP 500: ADO unavailable",
      }],
    });
  });

  it("syncs daemon queue items without dropping write-back attempt history", () => {
    syncReviewHistoryLocal([
      queueItem({
        manualDispositionWriteBackOk: true,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackThreadId: "123",
        manualDispositionWriteBackUrl: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
        manualDispositionWriteBackEvents: [
          queueItem().manualDispositionWriteBackEvents[0]!,
          {
            disposition: "changes_requested",
            at: "2026-06-11T00:02:02.000Z",
            ok: true,
            actor: "desktop-user",
            note: "Please address the Review Queue findings.",
            error: "",
            threadId: "123",
            url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
          },
        ],
      }),
    ]);

    const [item] = listReviewHistoryLocal("demo-repo");
    expect(item?.manualDispositionWriteBackEvents).toHaveLength(2);
    expect(item?.manualDispositionWriteBackEvents.at(-1)).toMatchObject({
      ok: true,
      threadId: "123",
      url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=123",
    });
  });

  it("keeps the newest merged queue item including write-back attempt events", () => {
    const older = queueItem({
      lastRunAt: "2026-06-11T00:00:00.000Z",
      manualDispositionWriteBackEvents: [],
    });
    const newer = queueItem({
      lastRunAt: "2026-06-11T00:05:00.000Z",
      manualDispositionWriteBackEvents: [{
        disposition: "changes_requested",
        at: "2026-06-11T00:05:02.000Z",
        ok: true,
        actor: "desktop-user",
        note: "Retried successfully.",
        error: "",
        threadId: "456",
        url: "https://dev.azure.com/demo/Project/_git/repo/pullrequest/42?_a=files&discussionId=456",
      }],
    });

    const merged = mergeReviewQueueItems([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.manualDispositionWriteBackEvents).toEqual(newer.manualDispositionWriteBackEvents);
  });

  it("ignores corrupt browser history instead of throwing", () => {
    localStorage.setItem(REVIEW_HISTORY_LS_KEY, "{not-json");

    expect(listReviewHistoryLocal("demo-repo")).toEqual([]);
  });
});
