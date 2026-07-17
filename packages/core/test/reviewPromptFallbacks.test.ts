import { describe, expect, it } from "vitest";
import type { CloudContextBundle } from "../src/review/cloudContext.js";
import { bundleToReviewPrompt } from "../src/review/prompt.js";
import { DEFAULT_AUTO_APPROVAL_POLICY, decideReviewOutcome } from "../src/review/reviewDecision.js";

describe("review prompt unavailable-state wording", () => {
  it("does not feed unknown placeholders into Azure DevOps PR signals", () => {
    const bundle: CloudContextBundle = {
      prId: 2670,
      iterationId: 4,
      files: [
        {
          path: "src/app.ts",
          changeType: "edit",
          content: "export const changed = true;",
        },
      ],
      relatedSnippets: [],
      pullRequest: {
        title: "Update app flow",
        description: "",
        status: "",
        isDraft: false,
        sourceBranch: "",
        targetBranch: "",
        createdBy: "",
        workItemIds: [],
        reviewerCount: 0,
        voteSummary: {
          approved: 0,
          waiting: 0,
          rejected: 0,
        },
        threadCount: 0,
        activeThreadCount: 0,
        failedBuildCount: 0,
        latestBuildResult: "",
        latestBuildStatus: "",
      },
    };

    const prompt = bundleToReviewPrompt(bundle, []);

    expect(prompt).toContain("- Status: not available");
    expect(prompt).toContain("- Branches: branch not available -> branch not available");
    expect(prompt).toContain("- Author: not available");
    expect(prompt).toContain("latest status=not available, latest result=not available");
    expect(prompt).not.toContain("(unknown)");
  });

  it("uses readable missing target branch wording in review decisions", () => {
    const decision = decideReviewOutcome({
      policy: {
        ...DEFAULT_AUTO_APPROVAL_POLICY,
        reviewerId: "reviewer-1",
      },
      targetBranch: "",
      changedFiles: [
        {
          path: "src/app.ts",
          changeType: "edit",
          content: "export const changed = true;",
        },
      ],
      findings: [],
      reviewUsedLlm: true,
    });

    expect(decision.reason).toBe(
      "Target branch not available is outside auto-approval policy.",
    );
    expect(decision.reason).not.toContain("(unknown)");
  });
});
