import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMClient, resetSettingsForTests } from "@cicd-agent/core";
import {
  createChatToolExecutors,
  deriveWorkflowPendingAction,
  inferPendingAction,
  structuredDoneAfterConfirmedAction,
} from "../src/chatSession.js";
import type { ChatPlannerResult, PendingToolAction } from "@cicd-agent/core";

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

  it("does not continue a fixed PR workflow from executed history alone", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("Ready to continue toward the pull request. Shall I proceed?"),
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
      [
        { role: "user", content: "rebase onto origin/main with autostash", timestamp: 0 },
      ],
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
      { role: "user", content: "push the branch", timestamp: 0 },
      { role: "assistant", content: "Would you like me to push the branch?", timestamp: 1 },
    ]);
    expect(pending?.tool).toBe("git_push");
  });

  it("stops after push when the user only asked for stage commit and push", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("The changes have been pushed successfully. Shall I proceed to create a pull request targeting the main branch?"),
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
      args: { branch: "feature/cicd-agent", setUpstream: true },
      description: "Push branch feature/cicd-agent to origin.",
      nextHint: "report push result",
      workflow: {
        kind: "commit",
        phase: "push",
        branch: "feature/cicd-agent",
        message: "feat: update agent workflow",
        pushAfterCommit: true,
      },
    };

    const done = structuredDoneAfterConfirmedAction(action, { stdout: "pushed", returncode: 0 });

    expect(done?.workflowKind).toBe("commit");
    expect(done?.workflowPhase).toBe("pushed");
    expect(done?.result.toolCallsMade).toEqual([{
      name: "git_push",
      args: { branch: "feature/cicd-agent", setUpstream: true },
      ok: true,
    }]);
    expect(done?.result.response).toContain("stopped here");
    expect(done?.result.response).toContain("will not create a pull request");
  });

  it("returns a selectable artifact for failed validation results", () => {
    const action: PendingToolAction = {
      tool: "validation_command",
      args: { command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test", kind: "test" },
      description: "Run tests",
      workflow: { kind: "ci", phase: "test" },
      preflight: {
        kind: "validation",
        status: "ready",
        validationKind: "test",
        command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test",
        commandSource: "derived",
        changedFileCount: 2,
        selectedScript: "test",
        packageFilters: ["@demo/app"],
        packageRoots: ["apps/app"],
        selectionReason: "Single touched package has a test script.",
        summary: "Derived package test command.",
      },
    };

    const done = structuredDoneAfterConfirmedAction(action, {
      returncode: 1,
      duration_ms: 1200,
      summary: "Validation command failed with exit code 1.",
      failure_excerpt: "FAIL src/app.test.ts\nExpected true to be false",
      stdout: "test stdout",
      stderr: "test stderr",
    });

    expect(done?.workflowKind).toBe("ci");
    expect(done?.workflowPhase).toBe("test_failed");
    expect(done?.result.artifacts).toEqual([
      expect.objectContaining({
        type: "artifact",
        title: "Test failure report",
        artifactType: "markdown",
        status: "error",
      }),
    ]);
    expect(done?.result.artifacts?.[0]?.content).toContain("# Test Failure Report");
    expect(done?.result.artifacts?.[0]?.content).toContain("Package filters: `@demo/app`");
    expect(done?.result.artifacts?.[0]?.content).toContain("Expected true to be false");
  });

  it("stops after commit when the user only asked to stage and commit", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("The changes have been committed successfully. Shall I push the current branch?"),
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
      result("The push failed because the remote is ahead. Shall I pull with rebase and retry?"),
      [
        { role: "user", content: "commit and push these changes", timestamp: 0 },
        { role: "tool", content: "failed", timestamp: 1, toolName: "git_push", toolOk: false },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("git_rebase");
  });

  it("blocks pull/rebase recovery when push was outside the user's requested scope", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      result("The push failed because the remote is ahead. Shall I pull with rebase and retry?"),
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
      result("The rebase conflicts are resolved. Shall I continue the rebase process?"),
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
        ...result("The files are staged. Shall I commit the conflict resolution?"),
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
      result("The changes have been pushed successfully. Shall I proceed to create a pull request targeting the main branch?"),
      [
        { role: "user", content: "stage changes, commit, push, and create a PR", timestamp: 0 },
        { role: "tool", content: "ok", timestamp: 1, toolName: "git_add", toolOk: true },
        { role: "tool", content: "ok", timestamp: 2, toolName: "git_commit", toolOk: true },
        { role: "tool", content: "ok", timestamp: 3, toolName: "git_push", toolOk: true },
      ],
    );
    expect(derived.approvalProposal?.tool).toBe("ado_create_pr");
  });

  it("strips out-of-scope Azure DevOps approval proposals", () => {
    const derived = deriveWorkflowPendingAction(
      "s1",
      {
        ...result("The branch is pushed. Shall I create a PR?"),
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

  it("returns follow-up repository context after refreshing the index", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "";
    process.env.AZURE_OPENAI_API_KEY = "";
    process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-index-tool-"));
    resetSettingsForTests();

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-index-repo-"));
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "README.md"), "# Demo Architecture\n\nThe daemon streams chat events.\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "server.ts"), "export function startServer() { return 'daemon api'; }\n", "utf8");

    const executors = await createChatToolExecutors(
      {
        repoPath: repo,
        env: {},
        timeoutSec: 10,
        extra: { chat_message: "Explain this project architecture" },
      },
      new LLMClient(),
    );
    try {
      const result = await executors.plannerExecutor.call("repo_refresh_index", {});
      expect(result.ok).toBe(true);
      expect(Number(result.filesSeen)).toBeGreaterThanOrEqual(1);
      expect(Number(result.totalFilesIndexed)).toBeGreaterThanOrEqual(1);
      expect(String(result.summary)).toContain("Current index");
      expect(String(result.summary)).toContain("Follow-up repository context");
      expect(String(result.contextSummary)).toContain("index is available");
      expect(String(result.repositoryContextPrompt)).toContain("Demo Architecture");
      expect(String(result.repositoryContextPrompt)).toContain("src/server.ts");
      expect(String(result.instruction)).toContain("answer the user's original request");
      expect(String(result.instruction)).toContain("contextSources");
      expect(String(result.instruction)).toContain("incremental update count");
      const contextSources = result.contextSources as Array<{ type?: string; file?: string; title?: string; snippet?: string }>;
      expect(contextSources.some((source) =>
        source.type === "source_document" &&
        source.file === "src/server.ts",
      )).toBe(true);
    } finally {
      await executors.close();
    }
  });
});
