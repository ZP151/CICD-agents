import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listLocalReviewHistory,
  reviewHistoryStorePath,
  upsertLocalReviewHistory,
} from "../src/reviewHistoryLocal.js";

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
    });

    const items = listLocalReviewHistory({ dataDir, repository: "demo-repo" });
    expect(items).toHaveLength(1);
    expect(items[0]?.pullRequestId).toBe(42);
    expect(items[0]?.decisionQueue).toBe("auto_approved");
  });
});
