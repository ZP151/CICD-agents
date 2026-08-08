import { describe, expect, it } from "vitest";
import { classifyFailure, failureSignatureFor, redactLogText } from "../src/index.js";

const base = { taskNames: [], logExcerpts: [], changedFiles: [], hasPublishedTests: false, cancelledByUser: false };

describe("failure evidence and classification", () => {
  it("redacts credential-shaped values and bounds excerpts", () => {
    const long = `token = abc123secret ` + "x".repeat(10_000);
    const { excerpt, contentHash } = redactLogText(long);
    expect(excerpt).not.toContain("abc123secret");
    expect(excerpt.length).toBeLessThanOrEqual(4_000 + 40);
    expect(contentHash).toBeTruthy();
  });

  it("classifies compile failures with changed code as code_regression", () => {
    const verdict = classifyFailure({
      ...base,
      changedFiles: ["src/App.cs"],
      logExcerpts: ["##[error]Program.cs(12,5): error CS1002: ; expected"],
    });
    expect(verdict.class).toBe("code_regression");
    expect(verdict.confidence).toBeGreaterThan(0.8);
  });

  it("classifies permission failures as permission_credential", () => {
    const verdict = classifyFailure({
      ...base,
      logExcerpts: ["##[error]TF400813: The user 'x' is not authorized to access this resource."],
    });
    expect(verdict.class).toBe("permission_credential");
  });

  it("classifies cancellations", () => {
    const verdict = classifyFailure({ ...base, cancelledByUser: true });
    expect(verdict.class).toBe("cancelled");
  });

  it("reports unknown with missing evidence when nothing is available", () => {
    const verdict = classifyFailure(base);
    expect(verdict.class).toBe("unknown");
    expect(verdict.missingEvidence.length).toBeGreaterThan(0);
  });

  it("produces a stable signature that normalizes timestamps and numbers", () => {
    const first = failureSignatureFor(117, "VSBuild", "2026-08-05T05:00:00Z error CS1002 line 42");
    const second = failureSignatureFor(117, "VSBuild", "2026-08-06T06:00:00Z error CS1002 line 99");
    expect(first.normalizedText).toBe(second.normalizedText);
  });
});
