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
  });
});
