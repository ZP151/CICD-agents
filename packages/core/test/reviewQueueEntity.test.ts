import { describe, expect, it } from "vitest";
import { entityToQueueItem } from "../src/reviewQueueEntity.js";

describe("reviewQueue entity mapping", () => {
  it("normalizes Azure Table review history entities into queue items", () => {
    const item = entityToQueueItem({
      partitionKey: "org/repo",
      rowKey: "42",
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      decisionReasonCodes: JSON.stringify(["coverage.low", "policy_blocked"]),
      contextConfidence: "low",
      findingCount: 2,
      discardedFindingCount: 1,
      manualDisposition: "changes_requested",
      manualDispositionEvents: JSON.stringify([
        { disposition: "changes_requested", at: "2026-06-18T00:00:00Z", actor: "reviewer", note: "Fix tests" },
      ]),
      manualDispositionWriteBackEvents: JSON.stringify([
        {
          disposition: "changes_requested",
          at: "2026-06-18T00:01:00Z",
          ok: true,
          actor: "reviewer",
          note: "Posted",
          threadId: "123",
          url: "https://dev.azure.com/demo/_git/repo/pullrequest/42",
        },
      ]),
    });

    expect(item).toMatchObject({
      repository: "org/repo",
      pullRequestId: 42,
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      decisionReasonCodes: ["coverage.low", "policy_blocked"],
      contextConfidence: "low",
      manualDisposition: "changes_requested",
      manualDispositionEvents: [
        { disposition: "changes_requested", at: "2026-06-18T00:00:00Z", actor: "reviewer", note: "Fix tests" },
      ],
      manualDispositionWriteBackEvents: [
        {
          disposition: "changes_requested",
          at: "2026-06-18T00:01:00Z",
          ok: true,
          actor: "reviewer",
          note: "Posted",
          error: "",
          threadId: "123",
          url: "https://dev.azure.com/demo/_git/repo/pullrequest/42",
        },
      ],
    });
  });

  it("falls back to safe queue defaults for malformed optional values", () => {
    const item = entityToQueueItem({
      partitionKey: "org/repo",
      rowKey: "bad-id",
      decisionQueue: "unknown",
      decisionRiskLevel: "critical",
      decisionReasonCodes: "one; two",
      contextConfidence: "certain",
      manualDisposition: "ignore",
      manualDispositionEvents: "{bad-json",
      manualDispositionWriteBackEvents: [{ disposition: "ignore" }],
    });

    expect(Number.isNaN(item.pullRequestId)).toBe(true);
    expect(item).toMatchObject({
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      decisionReasonCodes: ["one", "two"],
      contextConfidence: "",
      manualDisposition: "",
      manualDispositionEvents: [],
      manualDispositionWriteBackEvents: [],
    });
  });
});
