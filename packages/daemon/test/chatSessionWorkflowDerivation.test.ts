import { describe, expect, it } from "vitest";
import type { PendingToolAction } from "@mergepilot/core";
import {
  deriveWorkflowPendingAction,
  inferPendingAction,
  structuredDoneAfterConfirmedAction,
} from "../src/chatSession.js";
import { plannerResult } from "./chatSessionWorkflowTestDoubles.js";

describe("chat session workflow action derivation", () => {
  it("does not re-infer staging from a safe no-staged-changes conclusion", () => {
    const response =
      "No staged changes were found, so I did not create a commit. " +
      "If you want me to create the commit anyway, ask me to stage all changes.";
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult(response),
      [{
        role: "user",
        content:
          "Commit staged changes with message \"chore: should not happen\". " +
          "Do not stage anything. If nothing is staged, explain and stop.",
        timestamp: 0,
      }],
    );

    expect(derived.response).toBe(response);
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("rejects a provided staging proposal when the latest user turn forbids staging", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("Shall I stage all changes?"),
        approvalProposal: {
          tool: "git_add",
          args: {},
          description: "Stage all changes",
          nextHint: "commit staged changes",
        },
      },
      [{ role: "user", content: "Commit what is staged. Do not stage anything.", timestamp: 0 }],
    );

    expect(derived.approvalProposal).toBeUndefined();
    expect(derived.response).toMatch(/outside this turn's explicit scope/i);
  });

  it("keeps path-scoped staging distinct from a prohibition on another path", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("Shall I stage README.md?"),
        approvalProposal: {
          tool: "git_add",
          args: { paths: ["README.md"] },
          description: "Stage README.md",
          nextHint: "done",
        },
      },
      [{ role: "user", content: "Stage only README.md. Do not stage notes.txt.", timestamp: 0 }],
    );

    expect(derived.approvalProposal?.tool).toBe("git_add");
    expect(derived.approvalProposal?.args).toEqual({ paths: ["README.md"] });
  });

  it("derives explicit stash requests instead of defaulting to stage", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Do you want me to stash these changes before switching context?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "push" });
  });

  it("derives explicit stash apply requests without dropping the stash", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I apply the latest stash without dropping it?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "apply" });
  });

  it("keeps user stash apply intent even if the planner proposes pop wording", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I run git stash pop to restore the latest stash?"),
      [
        {
          role: "user",
          content: "Apply the latest stash without dropping it.",
          timestamp: 0,
        },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "apply" });
  });

  it("corrects explicit planner stash pop proposals when the user asked to apply without dropping", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("Ready to restore the latest stash."),
        approvalProposal: {
          tool: "git_stash",
          args: { action: "pop" },
          description: "Restore latest stash",
          nextHint: "continue workflow",
        },
      },
      [
        {
          role: "user",
          content: "Apply the latest stash without dropping it.",
          timestamp: 0,
        },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "apply" });
  });

  it("derives explicit stash pop requests as dropping restores", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I run git stash pop to restore and drop the latest stash?"),
      [
        {
          role: "user",
          content: "Pop the latest stash. It is OK to drop it after a successful restore.",
          timestamp: 0,
        },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "pop" });
  });

  it("does not rewrite explicit user pop intent to apply", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("Ready to restore the latest stash."),
        approvalProposal: {
          tool: "git_stash",
          args: { action: "pop" },
          description: "Pop latest stash",
          nextHint: "continue workflow",
        },
      },
      [
        {
          role: "user",
          content: "Pop the latest stash and drop it if the restore succeeds.",
          timestamp: 0,
        },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_stash");
    expect(derived.approvalProposal?.args).toEqual({ action: "pop" });
  });

  it("derives release tag requests as high-risk Git tag actions", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I create git tag v1.2.3-test on HEAD with message: \"Test release\"?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_tag");
    expect(derived.approvalProposal?.args).toEqual({
      name: "v1.2.3-test",
      ref: "HEAD",
      message: "Test release",
      annotated: true,
    });
  });

  it("derives explicit tag push requests without treating them as branch pushes", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I push release tag v1.2.3-test to origin now?"),
      [
        { role: "user", content: "Push release tag v1.2.3-test to origin only", timestamp: 0 },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_push_tag");
    expect(derived.approvalProposal?.args).toEqual({
      name: "v1.2.3-test",
      remote: "origin",
    });
  });

  it("does not treat pull request label wording as a Git tag push", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I add the ready-for-review tag to the pull request?"),
      [],
    );
    expect(derived.approvalProposal?.tool).not.toBe("git_push_tag");
    expect(derived.approvalProposal?.tool).not.toBe("git_tag");
  });

  it("derives explicit branch creation requests", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I create a new branch named feature/review-queue now?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_create_branch");
    expect(derived.approvalProposal?.args).toEqual({ name: "feature/review-queue" });
  });

  it("does not continue a fixed PR workflow from executed history alone", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Ready to continue toward the pull request. Shall I proceed?"),
      [
        { role: "user", content: "stage, commit, push and create a PR", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
        { role: "tool", content: "main", timestamp: 3, toolName: "git_current_branch", toolOk: true, toolResult: { stdout: "feature/x\n" } },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("does not infer a write action for generic read-only confirmations", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Do you want me to inspect the recent log next?"),
      [],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("derives branch switching requests without treating them as branch creation", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Shall I switch to branch feature/existing-work now?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_checkout");
    expect(derived.approvalProposal?.args).toEqual({ ref: "feature/existing-work" });
  });

  it("derives rebase requests as high-risk workflow actions", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Do you want me to rebase onto origin/main with autostash?"),
      [
        { role: "user", content: "rebase onto origin/main with autostash", timestamp: 0 },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_rebase");
    expect(derived.approvalProposal?.args).toEqual({ onto: "origin/main", autostash: true });
  });

  it("does not create a merge or rebase approval when no target ref was stated", () => {
    const rebase = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Do you want me to rebase the current branch before pushing?"),
      [{ role: "user", content: "rebase the current branch", timestamp: 0 }],
    );
    const merge = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Should I merge the latest changes now?"),
      [{ role: "user", content: "merge the latest changes", timestamp: 0 }],
    );

    expect(rebase.approvalProposal).toBeUndefined();
    expect(merge.approvalProposal).toBeUndefined();
  });

  it("derives restore requests only when a path is present", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("Should I restore package-lock.json before committing the rest?"),
      [],
    );
    expect(derived.approvalProposal?.tool).toBe("git_restore");
    expect(derived.approvalProposal?.args).toEqual({ paths: ["package-lock.json"], staged: false });
  });

  it("keeps last-resort inference aligned with explicit write intent", () => {
    const pending = inferPendingAction([
      { role: "user", content: "push the branch", timestamp: 0 },
      { role: "assistant", content: "Would you like me to push the branch?", timestamp: 1 },
    ]);
    expect(pending?.tool).toBe("git_push");
  });

  it("stops after push when the user only asked for stage commit and push", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The changes have been pushed successfully. Shall I proceed to create a pull request targeting the main branch?"),
      [
        { role: "user", content: "stage changes, commit and push to remote side", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
        { role: "tool", content: "ok", timestamp: 3, toolName: "git_push", toolOk: true },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("returns a structured done result after an in-scope commit workflow push", () => {
    const action: PendingToolAction = {
      tool: "git_push",
      args: { branch: "feature/mergepilot", setUpstream: true },
      description: "Push branch feature/mergepilot to origin.",
      nextHint: "report push result",
      workflow: {
        kind: "commit",
        phase: "push",
        branch: "feature/mergepilot",
        message: "feat: update agent workflow",
        pushAfterCommit: true,
      },
    };

    const done = structuredDoneAfterConfirmedAction(action, { stdout: "pushed", returncode: 0 });

    expect(done?.workflowKind).toBe("commit");
    expect(done?.workflowPhase).toBe("pushed");
    expect(done?.result.toolCallsMade).toEqual([{
      name: "git_push",
      args: { branch: "feature/mergepilot", setUpstream: true },
      ok: true,
    }]);
    expect(done?.result.response).toContain("stopped here");
    expect(done?.result.response).toContain("will not create a pull request");
  });

  it("returns a structured done result after fetching remote refs", () => {
    const action: PendingToolAction = {
      tool: "git_fetch",
      args: { remote: "origin", prune: true },
      description: "Fetch latest remote refs from origin.",
      nextHint: "refresh branch status",
      workflow: {
        kind: "git",
        phase: "fetch_remotes",
        branch: "main",
      },
    };

    const done = structuredDoneAfterConfirmedAction(action, { stdout: "", returncode: 0 });

    expect(done?.workflowKind).toBe("git");
    expect(done?.workflowPhase).toBe("fetched");
    expect(done?.currentStep).toBe("Fetched origin");
    expect(done?.result.response).toContain("Refresh branch status next");
    expect(done?.result.suggestions).toContain("Refresh branch status");
    expect(done?.result.toolCallsMade).toEqual([{
      name: "git_fetch",
      args: { remote: "origin", prune: true },
      ok: true,
    }]);
  });

  it("stops after commit when the user only asked to stage and commit", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The changes have been committed successfully. Shall I push the current branch?"),
      [
        { role: "user", content: "stage the changes, commit", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("allows pull/rebase recovery only after an in-scope failed push", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The push failed because the remote is ahead. Shall I pull with rebase and retry?"),
      [
        { role: "user", content: "commit and push these changes", timestamp: 0 },
        { role: "tool", content: "failed", timestamp: 1, toolName: "git_push", toolOk: false },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_pull");
    expect(derived.approvalProposal?.args).toMatchObject({
      remote: "origin",
      rebase: true,
    });
  });

  it("keeps an explicit origin branch on natural-language pull approvals", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("I can pull the latest changes with rebase before any push. Shall I proceed?"),
      [
        {
          role: "user",
          content: "Pull latest from origin main with rebase. Do not push, stage, commit, or create a PR.",
          timestamp: 0,
        },
      ],
    );

    expect(derived.approvalProposal?.tool).toBe("git_pull");
    expect(derived.approvalProposal?.args).toEqual({
      remote: "origin",
      branch: "main",
      rebase: true,
      ffOnly: false,
    });
  });

  it("blocks pull/rebase recovery when push was outside the user's requested scope", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The push failed because the remote is ahead. Shall I pull with rebase and retry?"),
      [
        { role: "user", content: "stage the changes, commit", timestamp: 0 },
        { role: "tool", content: "failed", timestamp: 1, toolName: "git_push", toolOk: false },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("derives rebase continue instead of starting a new rebase during conflict recovery", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The rebase conflicts are resolved. Shall I continue the rebase process?"),
      [
        { role: "user", content: "rebase onto origin/main", timestamp: 0 },
        { role: "tool", content: "conflict", timestamp: 1, toolName: "git_rebase", toolOk: false },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_rebase");
    expect(derived.approvalProposal?.args).toEqual({ action: "continue" });
  });

  it("blocks normal commit proposals while a rebase conflict is unresolved", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("The files are staged. Shall I commit the conflict resolution?"),
        approvalProposal: {
          tool: "git_commit",
          args: { message: "resolve rebase conflicts" },
          description: "Commit staged changes",
          nextHint: "push branch",
        },
      },
      [
        { role: "user", content: "push my branch", timestamp: 0 },
        {
          role: "tool",
          content: "CONFLICT (content): Merge conflict in app.config",
          timestamp: 1,
          toolName: "git_rebase",
          toolOk: false,
          toolResult: {
            returncode: 1,
            stdout: "CONFLICT (content): Merge conflict in app.config\n",
            stderr: "Resolve all conflicts manually, mark them as resolved with git add, then run git rebase --continue.\n",
          },
        },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("allows pull request creation only when the user asked for it", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      plannerResult("The changes have been pushed successfully. Shall I proceed to create a pull request targeting the main branch?"),
      [
        { role: "user", content: "stage changes, commit, push, and create a PR", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
        { role: "tool", content: "ok", timestamp: 3, toolName: "git_push", toolOk: true },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("ado_create_pr");
    expect(derived.approvalProposal?.args).toMatchObject({ target_branch: "main" });
  });

  it("rejects an in-scope PR proposal whose target branch is not explicit", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("The branch is pushed. Shall I create a pull request?"),
        approvalProposal: {
          tool: "ado_create_pr",
          args: { source_branch: "feature/x", title: "Update" },
          description: "Create pull request",
          nextHint: "done",
        },
      },
      [{ role: "user", content: "create a PR", timestamp: 0 }],
    );

    expect(derived.approvalProposal).toBeUndefined();
  });

  it("strips out-of-scope Azure DevOps approval proposals", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...plannerResult("The branch is pushed. Shall I create a PR?"),
        approvalProposal: {
          tool: "ado_create_pr",
          args: { source_branch: "feature/x", title: "Update" },
          description: "Create pull request",
          nextHint: "done",
        },
      },
      [
        { role: "user", content: "stage changes, commit and push to remote side", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_push", toolOk: true },
      ],
    );
    expect(derived.approvalProposal).toBeUndefined();
  });

  it("does not infer out-of-scope PR actions after session reload", () => {
    const pending = inferPendingAction([
      { role: "user", content: "stage changes, commit and push", timestamp: 0 },
      { role: "assistant", content: "The branch is pushed. Shall I create a PR?", timestamp: 1 },
    ]);
    expect(pending).toBeUndefined();
  });
});
