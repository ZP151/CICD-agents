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

  it("keeps an explicitly requested pull in scope when a negative clause only forbids later actions", () => {
    const request = "Pull latest from origin main with rebase. Do not push, stage, commit, or create a PR.";

    expect(isExplicitReadOnlyRequest(request)).toBe(false);
  });

  it("treats a git tag creation request as a write request even when later pushes are forbidden", () => {
    const request =
      "Create local git tag v0.0.1-live-tag on HEAD with message 'release candidate'. Do not push tags, do not push the branch, and do not create a PR.";

    expect(isExplicitReadOnlyRequest(request)).toBe(false);

    const result: ChatPlannerResult = {
      response: "Tag created.",
      riskLevel: "low",
      actionsTaken: ["git_tag"],
      suggestions: ["Push the tag"],
      toolCallsMade: [{ name: "git_tag", args: { name: "v0.0.1-live-tag" }, ok: true }],
      usedLlm: true,
      approvalProposal: {
        tool: "git_tag",
        args: { name: "v0.0.1-live-tag" },
        description: "Create tag v0.0.1-live-tag",
      },
    };

    const guarded = guardReviewOnlyFinalResult(result, request);
    expect(guarded.approvalProposal).toBeDefined();
  });

  it("treats a git discard request as a write request even when staging and pushing are forbidden", () => {
    const request =
      "Discard changes in README.md only. Do not touch notes.txt. Do not stage, commit, push, or create a PR.";

    expect(isExplicitReadOnlyRequest(request)).toBe(false);
  });

  it("treats a git revert request as a write request even when reset is forbidden", () => {
    const request = "Revert the last commit using git revert HEAD. Do not reset, push, or create a PR.";

    expect(isExplicitReadOnlyRequest(request)).toBe(false);
  });

  it("keeps genuinely read-only review requests read-only after the verb list grew", () => {
    const review = "Assess changed files for correctness, security, config, tests, and deployment risk. Read-only only.";
    const inspect = "Only inspect the current Project Link repository branch and uncommitted changes. Do not modify any files.";
    const clean = "Only check for untracked files. Do not clean, reset, remove, or discard anything.";

    expect(isExplicitReadOnlyRequest(review)).toBe(true);
    expect(isExplicitReadOnlyRequest(inspect)).toBe(true);
    expect(isExplicitReadOnlyRequest(clean)).toBe(true);
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
