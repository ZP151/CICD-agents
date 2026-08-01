import { describe, expect, it } from "vitest";
import {
  guardReviewOnlyFinalResult,
  isExplicitReadOnlyRequest,
  requiredRepositoryStateEvidenceGuidance,
} from "../src/chatPlannerGuards.js";
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

  it("treats explicit do-not-write clauses as review-only scope", () => {
    const result: ChatPlannerResult = {
      response: "I reviewed the changes. Would you like me to stage these changes for a commit?",
      riskLevel: "medium",
      actionsTaken: ["git_status", "git_diff"],
      suggestions: ["Stage selected files", "Review exception handling"],
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

    const guarded = guardReviewOnlyFinalResult(
      result,
      "Review my changes. Do not stage, commit, or push.",
    );

    expect(guarded.approvalProposal).toBeUndefined();
    expect(guarded.response).not.toContain("Would you like me to stage");
    expect(guarded.suggestions).toEqual(["Review exception handling"]);
  });

  it("treats changed-file assessment as review-only scope", () => {
    const result: ChatPlannerResult = {
      response: "I assessed the changed files. Would you like me to stage these changes for a commit?",
      riskLevel: "medium",
      actionsTaken: ["git_status", "git_diff"],
      suggestions: ["Stage selected files", "Review exception handling"],
      toolCallsMade: [],
      usedLlm: true,
      approvalProposal: {
        tool: "git_add",
        args: {},
        description: "Stage all changes",
      },
    };

    const guarded = guardReviewOnlyFinalResult(
      result,
      "Assess changed files for correctness, security, config, tests, and deployment risk. Read-only only.",
    );

    expect(guarded.approvalProposal).toBeUndefined();
    expect(guarded.response).not.toContain("Would you like me to stage");
    expect(guarded.suggestions).toEqual(["Review exception handling"]);
  });

  it("treats explicit read-only instructions as a hard no-write boundary", () => {
    const result: ChatPlannerResult = {
      response: "I inspected the target repository. Shall I merge the branch?",
      riskLevel: "medium",
      actionsTaken: ["git_status"],
      suggestions: ["Merge the branch", "Inspect the diff"],
      toolCallsMade: [{ name: "git_status", args: { short: true }, ok: true }],
      usedLlm: true,
      approvalProposal: { tool: "git_merge", args: { ref: "branch" }, description: "Merge branch" },
    };

    const request = "Only inspect the current Project Link repository branch and uncommitted changes. Do not modify any files.";
    const guarded = guardReviewOnlyFinalResult(result, request);

    expect(isExplicitReadOnlyRequest(request)).toBe(true);
    expect(guarded.approvalProposal).toBeUndefined();
    expect(guarded.response).not.toContain("Shall I merge");
    expect(guarded.suggestions).toEqual(["Inspect the diff"]);
  });

  it("requires direct Git evidence before indexing a live working-tree request", () => {
    const request = "Read-only: inspect the current working tree and uncommitted changes. Do not modify files.";

    expect(requiredRepositoryStateEvidenceGuidance("repo_refresh_index", request, [], [])).toContain("Run git_status");
    expect(requiredRepositoryStateEvidenceGuidance("repo_refresh_index", request, [], [
      { name: "git_status", args: { short: true }, ok: true },
    ])).toBe("");
    expect(requiredRepositoryStateEvidenceGuidance("repo_refresh_index", "Explain this project architecture", [], [])).toBe("");
  });
});
