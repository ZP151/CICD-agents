import { describe, expect, it } from "vitest";
import { CHAT_SYSTEM_PROMPT } from "../src/chatPlanner.js";
import { CHAT_AGENT_USE_CASES, chatAgentUseCasePrompt } from "../src/chatUseCases.js";
import { translateIntent } from "../src/tools/gitIntent.js";

describe("Chat agent use-case coverage", () => {
  it("covers the major Git, PR, CI/CD, and repository-understanding responsibilities", () => {
    const ids = CHAT_AGENT_USE_CASES.map((useCase) => useCase.id);

    expect(ids).toEqual(expect.arrayContaining([
      "project-understanding",
      "change-review",
      "test-selection",
      "branch-management",
      "commit-workflow",
      "remote-sync",
      "pr-insight",
      "pr-creation",
      "shelve-and-restore",
      "cicd-operations",
    ]));
  });

  it("keeps write-oriented use cases behind approval", () => {
    const writeUseCases = CHAT_AGENT_USE_CASES.filter((useCase) => useCase.writeTools.length > 0);

    expect(writeUseCases.length).toBeGreaterThan(0);
    expect(writeUseCases.every((useCase) => useCase.approval === "required")).toBe(true);
  });

  it("injects the use-case catalog into the planner prompt", () => {
    const prompt = chatAgentUseCasePrompt();

    expect(prompt).toContain("Create and update pull requests");
    expect(prompt).toContain("Approval: required");
    expect(CHAT_SYSTEM_PROMPT).toContain("Core Chat Agent Use Cases");
    expect(CHAT_SYSTEM_PROMPT).toContain("commit-workflow");
    expect(CHAT_SYSTEM_PROMPT).toContain("ado_trigger_pipeline");
    expect(CHAT_SYSTEM_PROMPT).toContain("Execute progressively");
    expect(CHAT_SYSTEM_PROMPT).toContain("read-only facts are independent");
    expect(CHAT_SYSTEM_PROMPT).toContain("First select the minimal evidence set");
    expect(CHAT_SYSTEM_PROMPT).toContain("active branch, working-tree status, and recent commit");
    expect(CHAT_SYSTEM_PROMPT).toContain("The final response is a conclusion, not a second plan");
    expect(CHAT_SYSTEM_PROMPT).toContain("Never narrate what you collected, name tools, offer a next-action menu");
    expect(CHAT_SYSTEM_PROMPT).toContain("Do not inspect diffs merely because status reports modified files");
    expect(CHAT_SYSTEM_PROMPT).toContain("Use English for user-facing action narratives, approvals, and final responses by default.");
    expect(CHAT_SYSTEM_PROMPT).toContain("Do not change workflow, safety, or rendering behavior based on the input language.");
  });
});

describe("offline Git intent coverage", () => {
  it("plans fetch and compare requests without mutating the branch", () => {
    const plan = translateIntent("fetch and compare this branch with origin/main");

    expect(plan.intent).toBe("compare-with-remote");
    expect(plan.steps.map((step) => step.tool)).toEqual(["git_fetch", "git_status", "git_merge_base", "git_diff"]);
    expect(plan.steps.find((step) => step.tool === "git_diff")?.args).toMatchObject({ target_branch: "origin/main", stat: true });
  });

  it("routes push plus PR requests to the PR workflow instead of plain push", () => {
    const plan = translateIntent("push and create PR for branch feature/chat-agent");

    expect(plan.intent).toBe("create-pr");
    expect(plan.steps.map((step) => step.tool)).toContain("ado_create_pr");
  });

  it("plans restore only when a concrete path is present", () => {
    const plan = translateIntent("restore package-lock.json before committing");

    expect(plan.intent).toBe("restore-path");
    expect(plan.steps.find((step) => step.tool === "git_restore")?.args).toEqual({
      paths: ["package-lock.json"],
      staged: false,
    });
  });

  it("plans rebase with explicit target and autostash", () => {
    const plan = translateIntent("rebase onto origin/main with autostash");

    expect(plan.intent).toBe("rebase-branch");
    expect(plan.steps.find((step) => step.tool === "git_rebase")?.args).toEqual({
      onto: "origin/main",
      autostash: true,
    });
  });

  it("plans ordinary push without inventing PR creation", () => {
    const plan = translateIntent("push the current branch");

    expect(plan.intent).toBe("push-branch");
    expect(plan.steps.map((step) => step.tool)).not.toContain("ado_create_pr");
  });
});
