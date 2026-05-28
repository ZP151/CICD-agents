import { describe, expect, it } from "vitest";
import { deriveWorkflowPendingAction, inferPendingAction } from "../src/chatSession.js";
import type { ChatPlannerResult } from "@cicd-agent/core";

function result(response: string): ChatPlannerResult {
  return {
    response,
    riskLevel: "medium",
    actionsTaken: [],
    suggestions: [],
    toolCallsMade: [],
    usedLlm: true,
  };
}

describe("chat session workflow action derivation", () => {
  it("derives explicit stash requests instead of defaulting to stage", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Do you want me to stash these changes before switching context?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "push" });
  });

  it("derives explicit branch creation requests", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Shall I create a new branch named feature/review-queue now?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_create_branch");
    expect(derived.approvalProposal?.args).toEqual({ name: "feature/review-queue" });
  });

  it("continues the PR workflow from actual executed history", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Ready to continue toward the pull request. Shall I proceed?"),
      [
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
        { role: "tool", content: "main", timestamp: 3, toolName: "git_current_branch", toolOk: true, toolResult: { stdout: "feature/x\n" } },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_push");
    expect(derived.approvalProposal?.args).toEqual({ branch: "feature/x" });
  });

  it("does not infer a write action for generic read-only confirmations", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Do you want me to inspect the recent log next?"),
      [],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("derives branch switching requests without treating them as branch creation", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Shall I switch to branch feature/existing-work now?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_checkout");
    expect(derived.approvalProposal?.args).toEqual({ ref: "feature/existing-work" });
  });

  it("derives rebase requests as high-risk workflow actions", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Do you want me to rebase onto origin/main with autostash?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_rebase");
    expect(derived.approvalProposal?.args).toEqual({ onto: "origin/main", autostash: true });
  });

  it("derives restore requests only when a path is present", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Should I restore package-lock.json before committing the rest?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_restore");
    expect(derived.approvalProposal?.args).toEqual({ paths: ["package-lock.json"], staged: false });
  });

  it("keeps last-resort inference aligned with explicit write intent", () => {
    const pending = inferPendingAction([
      { role: "assistant", content: "Would you like me to push the branch?", timestamp: 1 },
    ]);
    expect(pending?.tool).toBe("git_push");
  });
});
