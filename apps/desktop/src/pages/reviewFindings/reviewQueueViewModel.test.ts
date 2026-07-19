import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  formatDate,
  operationActivityCategory,
  operationKindLabel,
  projectLinkReviewQueueCacheKey,
  riskTone,
  severityTone,
  shortCommit,
} from "./reviewQueueViewModel.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";

function event(overrides: Partial<ReviewOperationEvent>): ReviewOperationEvent {
  return {
    id: "1",
    kind: "review_run",
    repository: "repo",
    pullRequestId: 1,
    actor: "desktop-user",
    label: "Review",
    ok: true,
    details: "",
    at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("reviewQueueViewModel", () => {
  it("maps review operation events into activity categories", () => {
    expect(operationActivityCategory(event({ kind: "disposition" }))).toBe("disposition");
    expect(operationActivityCategory(event({ kind: "ado_retry" }))).toBe("ado");
    expect(operationActivityCategory(event({ kind: "review_run" }))).toBe("review");
    expect(operationActivityCategory(event({ ok: false }))).toBe("errors");
  });

  it("labels operation and finding categories for compact UI", () => {
    expect(operationKindLabel("batch_rerun")).toBe("Batch");
    expect(categoryLabel("missing-test")).toBe("Missing test");
  });

  it("maps risk and severity to semantic tones", () => {
    expect(riskTone("high")).toContain("--app-danger");
    expect(riskTone("medium")).toContain("--app-warning");
    expect(riskTone("low")).toContain("--app-success");
    expect(severityTone("blocking")).toContain("--app-danger");
    expect(severityTone("warning")).toContain("--app-warning");
  });

  it("formats short commits with fallback", () => {
    expect(shortCommit("abcdef1234567890")).toBe("abcdef123456");
    expect(shortCommit("   ")).toBe("commit unavailable");
  });

  it("does not surface invalid date strings", () => {
    expect(formatDate("")).toBe("Not available");
    expect(formatDate("not-a-date")).toBe("Not available");
  });

  it("keys Review Queue cache by Project Link mapping fields", () => {
    const base = {
      id: "pl-1",
      repoPath: "C:\\repo",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      defaultBranch: "feature/a",
      targetBranch: "main",
      updatedAt: 1,
    };

    expect(projectLinkReviewQueueCacheKey(base)).not.toBe(
      projectLinkReviewQueueCacheKey({ ...base, defaultBranch: "feature/b" }),
    );
    expect(projectLinkReviewQueueCacheKey(base)).not.toBe(
      projectLinkReviewQueueCacheKey({ ...base, adoRepoName: "OtherRepo" }),
    );
    expect(projectLinkReviewQueueCacheKey(null, "pl-1")).toContain("pl-1");
  });
});
