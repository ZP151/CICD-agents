import { describe, expect, it } from "vitest";
import { guardReviewOnlyFinalResult } from "../src/chatPlannerGuards.js";
import type { ChatPlannerResult } from "../src/chatPlannerTypes.js";

describe("chatPlannerGuards", () => {
  it("removes write-action prompts and suggestions from review-only change summaries", () => {
    const result: ChatPlannerResult = {
      response: [
        "The changes focus on error handling. Would you like me to stage these changes for a commit?",
        "",
        "› Test error handling changes thoroughly.",
        "› Update documentation for error handling improvements.",
      ].join("\n"),
      riskLevel: "medium",
      actionsTaken: ["git_status", "git_diff"],
      suggestions: [
        "Run unit tests",
        "Stage selected files",
        "Review exception handling",
      ],
      toolCallsMade: [
        { name: "git_status", args: { short: true }, ok: true },
        { name: "git_diff", args: { context: 5 }, ok: true },
      ],
      usedLlm: true,
      approvalProposal: {
        tool: "git_add",
        args: {},
        description: "Stage all changes",
      },
    };

    const guarded = guardReviewOnlyFinalResult(result, "Review my changes");

    expect(guarded.approvalProposal).toBeUndefined();
    expect(guarded.response).not.toContain("Would you like me to stage");
    expect(guarded.response).not.toContain("› Test");
    expect(guarded.response).not.toContain("› Update");
    expect(guarded.suggestions).toEqual(["Review exception handling"]);
  });
});
