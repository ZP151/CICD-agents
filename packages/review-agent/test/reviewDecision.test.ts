import { describe, expect, it } from "vitest";
import { decideReviewOutcome, DEFAULT_AUTO_APPROVAL_POLICY } from "../src/reviewDecision.js";

const policy = {
  ...DEFAULT_AUTO_APPROVAL_POLICY,
  enabled: true,
  reviewerId: "reviewer-guid",
};

describe("review decision", () => {
  it("auto-approves low-risk PRs when policy allows it", () => {
    const decision = decideReviewOutcome({
      policy,
      targetBranch: "refs/heads/main",
      changedFiles: [{ path: "src/app.ts", changeType: "edit", content: "export {}" }],
      findings: [],
      reviewUsedLlm: true,
    });
    expect(decision.queue).toBe("auto_approved");
    expect(decision.autoApprove).toBe(true);
    expect(decision.riskLevel).toBe("low");
    expect(decision.contextConfidence).toBe("high");
    expect(decision.reasonCodes).toContain("auto_approval.eligible");
  });

  it("routes warnings to human review", () => {
    const decision = decideReviewOutcome({
      policy,
      targetBranch: "main",
      changedFiles: [{ path: "src/app.ts", changeType: "edit", content: "export {}" }],
      findings: [{
        file: "src/app.ts",
        line: 1,
        severity: "warning",
        category: "missing-test",
        message: "Missing test coverage.",
      }],
      reviewUsedLlm: true,
    });
    expect(decision.queue).toBe("needs_human_review");
    expect(decision.autoApprove).toBe(false);
    expect(decision.riskLevel).toBe("medium");
    expect(decision.reasonCodes).toContain("risk.medium");
  });

  it("watches low-risk PRs when auto-approval is disabled", () => {
    const decision = decideReviewOutcome({
      policy: { ...policy, enabled: false },
      targetBranch: "main",
      changedFiles: [{ path: "README.md", changeType: "edit", content: "Updated setup notes." }],
      findings: [{
        file: "README.md",
        line: 1,
        severity: "info",
        category: "style",
        message: "Consider clarifying this setup note.",
      }],
      reviewUsedLlm: true,
    });
    expect(decision.queue).toBe("watching");
    expect(decision.autoApprove).toBe(false);
    expect(decision.riskLevel).toBe("low");
  });

  it("watches low-risk PRs until an approval reviewer is configured", () => {
    const decision = decideReviewOutcome({
      policy: { ...policy, reviewerId: "" },
      targetBranch: "main",
      changedFiles: [{ path: "README.md", changeType: "edit", content: "Updated setup notes." }],
      findings: [],
      reviewUsedLlm: true,
    });
    expect(decision.queue).toBe("watching");
    expect(decision.autoApprove).toBe(false);
    expect(decision.riskLevel).toBe("low");
  });

  it("blocks security findings", () => {
    const decision = decideReviewOutcome({
      policy,
      targetBranch: "main",
      changedFiles: [{ path: "src/app.ts", changeType: "edit", content: "export {}" }],
      findings: [{
        file: "src/app.ts",
        line: 1,
        severity: "info",
        category: "security",
        message: "Token leakage risk.",
      }],
      reviewUsedLlm: true,
    });
    expect(decision.queue).toBe("blocked");
    expect(decision.autoApprove).toBe(false);
    expect(decision.riskLevel).toBe("high");
    expect(decision.reasonCodes).toContain("risk.high");
  });

  it("does not approve when the review model did not run", () => {
    const decision = decideReviewOutcome({
      policy,
      targetBranch: "main",
      changedFiles: [{ path: "src/app.ts", changeType: "edit", content: "export {}" }],
      findings: [],
      reviewUsedLlm: false,
    });
    expect(decision.queue).toBe("needs_human_review");
    expect(decision.autoApprove).toBe(false);
    expect(decision.contextConfidence).toBe("low");
    expect(decision.reasonCodes).toContain("review.no_llm");
  });

  it("routes low-risk PRs to human review when context quality is not high enough", () => {
    const decision = decideReviewOutcome({
      policy,
      targetBranch: "main",
      changedFiles: [{ path: "src/app.ts", changeType: "edit", content: "export {}" }],
      findings: [],
      reviewUsedLlm: true,
      discardedFindingCount: 1,
      hunkCoverageFiles: 0,
      wholeFileFallbackFiles: 1,
      changedHunkLines: 0,
    });
    expect(decision.queue).toBe("needs_human_review");
    expect(decision.autoApprove).toBe(false);
    expect(decision.riskLevel).toBe("medium");
    expect(decision.contextConfidence).toBe("low");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "model_output.discarded_findings",
      "context.whole_file_fallback",
      "context.no_hunk_coverage",
    ]));
  });
});
