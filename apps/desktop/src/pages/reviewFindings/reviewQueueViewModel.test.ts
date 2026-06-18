import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  operationActivityCategory,
  operationKindLabel,
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
    expect(riskTone("high")).toContain("red");
    expect(riskTone("medium")).toContain("yellow");
    expect(riskTone("low")).toContain("emerald");
    expect(severityTone("blocking")).toContain("red");
    expect(severityTone("warning")).toContain("yellow");
  });

  it("formats short commits with fallback", () => {
    expect(shortCommit("abcdef1234567890")).toBe("abcdef123456");
    expect(shortCommit("   ")).toBe("commit unavailable");
  });
});
