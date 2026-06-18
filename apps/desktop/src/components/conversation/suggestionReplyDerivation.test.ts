import { describe, expect, it } from "vitest";
import {
  deriveSuggestionReplies,
  shouldQueueSuggestionReply,
} from "./SuggestionReplyBar.js";

describe("deriveSuggestionReplies", () => {
  it("suggests diff-aware follow-ups for review contexts", () => {
    const suggestions = deriveSuggestionReplies({
      lastUserText: "Review my changes",
      lastAssistantText: "git_status found modified files and git_diff inspected the diff.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check detailed diff",
      "Stage selected",
      "Draft commit message",
    ]);
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_changes" });
    expect(suggestions[1]?.action.kind).toBe("requires_approval");
    expect(suggestions[2]?.action).toEqual({ kind: "fill_composer" });
  });

  it("suggests architecture follow-ups for project understanding contexts", () => {
    const suggestions = deriveSuggestionReplies({
      lastUserText: "Explain this project architecture",
      lastAssistantText: "The daemon API and controller entry points handle the request flow.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Trace request flow",
      "List entry points",
      "Explain data model",
    ]);
  });

  it("suggests auth recovery without showing generic actions", () => {
    const suggestions = deriveSuggestionReplies({
      hasAuthError: true,
      lastAssistantText: "Azure DevOps OAuth token is unavailable.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Retry auth",
      "Explain auth",
    ]);
  });

  it("hides suggestions while typing or waiting for approval", () => {
    expect(deriveSuggestionReplies({ lastUserText: "review my changes", inputValue: "r" })).toEqual([]);
    expect(deriveSuggestionReplies({ lastUserText: "review my changes", pendingTool: "git_add" })).toEqual([]);
  });

  it("keeps suggestions visible while busy so they can be queued", () => {
    const suggestions = deriveSuggestionReplies({ lastUserText: "review my changes", busy: true });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check detailed diff",
      "Stage selected",
      "Draft commit message",
    ]);
  });

  it("uses commit workflow metadata before text fallback", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "commit",
      workflowPhase: "waiting_for_commit_approval",
      lastAssistantText: "The selected files are ready.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check staged diff",
      "Draft commit message",
      "Explain change scope",
    ]);
  });

  it("does not suggest PR, work item, or pipeline continuation after commit push scope completes", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "commit",
      workflowPhase: "pushed",
      workflowStatus: "done",
      lastUserText: "stage changes, commit and push to remote side",
      lastAssistantText: "The changes have been pushed. Shall I proceed to create a pull request and link a work item or trigger the pipeline?",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Summarize push",
      "Check branch",
      "Review commit",
    ]);
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "refresh_branch" });
    expect(suggestions.map((suggestion) => suggestion.message).join(" ")).not.toMatch(/pull request|work item|pipeline/i);
  });

  it("marks push suggestions as approval-gated instead of workspace actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "commit",
      workflowPhase: "waiting_for_push_approval",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Push branch",
      "Show remote target",
      "Check branch status",
    ]);
    expect(suggestions[0]?.action).toEqual({
      kind: "requires_approval",
      reason: "Pushing writes to the remote repository.",
    });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "refresh_branch" });
  });

  it("marks pull request read suggestions as workspace actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "pr",
      workflowPhase: "ready",
    });

    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_pr_insight" },
      { kind: "workspace_action", action: "check_pr_policy" },
      { kind: "workspace_action", action: "list_pr_work_items" },
    ]);
  });

  it("prioritizes validation, policy, and work items for PR CI readiness blockers", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "pr",
      workflowPhase: "inspected",
      lastAssistantText: "PR readiness is blocked by failed CI validation and a required policy.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Validation recovery",
      "Check policy",
      "List work items",
    ]);
    expect(suggestions[0]?.action).toEqual({ kind: "fill_composer" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "check_pr_policy" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "list_pr_work_items" });
  });

  it("prefers direct PR follow-up actions when saved artifact metadata has exact blockers", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "pr",
      workflowPhase: "inspected",
      metadataSuggestions: [
        "Build blockers: #77 20260610.1 CI: failed",
        "Policy blockers: Minimum reviewers: failed (blocking)",
        "workItems=0",
      ],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Rerun validation",
      "Check policy",
      "List work items",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "run_tests" },
      { kind: "workspace_action", action: "check_pr_policy" },
      { kind: "workspace_action", action: "list_pr_work_items" },
    ]);
  });

  it("suggests validation recovery actions after a failed test workflow", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "test_failed",
      workflowStatus: "done",
      lastAssistantText: "Tests failed. Key output: FAIL src/app.test.ts",
      metadataSuggestions: ["Inspect failing output", "Review changed files", "Rerun validation"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Analyze failure",
      "Rerun tests",
      "Review changes",
    ]);
    expect(suggestions[0]?.action).toEqual({ kind: "fill_composer" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "inspect_changes" });
  });

  it("suggests build rerun after a failed build workflow", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "build_failed",
      workflowStatus: "done",
      lastAssistantText: "Build failed.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Analyze failure",
      "Rerun build",
      "Review changes",
    ]);
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "run_build" });
  });

  it("suggests remote pipeline recovery after a failed pipeline inspection", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "pipeline_inspected",
      workflowStatus: "done",
      lastAssistantText: "Pipeline #12 latest run #77 20260613.1: completed/failed. Failed or canceled: 1.",
      metadataSuggestions: ["Pipeline #12 run #77 failure"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Analyze pipeline",
      "Rerun pipeline",
      "Run local validation",
    ]);
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "trigger_pipeline" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
  });

  it("uses repository index context for follow-up question prediction", () => {
    const suggestions = deriveSuggestionReplies({
      metadataActions: ["repo_refresh_index"],
      sourceTypes: ["source_document"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check architecture gaps",
      "Trace request flow",
      "Find test surface",
    ]);
  });

  it("predicts natural architecture follow-ups after an architecture answer", () => {
    const suggestions = deriveSuggestionReplies({
      lastUserText: "Explain this project architecture",
      lastAssistantText: "The project has controllers, models, and SharePoint integration.",
      sourceTypes: ["source_document"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Trace request flow",
      "List entry points",
      "Explain data model",
    ]);
  });

  it("suggests source-focused follow-ups from document and url source metadata", () => {
    const suggestions = deriveSuggestionReplies({
      sourceTypes: ["source_document", "source_url"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "List key files",
      "Trace source flow",
      "Summarize sources",
    ]);
  });
});

describe("shouldQueueSuggestionReply", () => {
  it("queues while busy, planning, or running", () => {
    expect(shouldQueueSuggestionReply({ busy: true })).toBe(true);
    expect(shouldQueueSuggestionReply({ workflowStatus: "planning" })).toBe(true);
    expect(shouldQueueSuggestionReply({ workflowStatus: "running" })).toBe(true);
  });

  it("does not queue when idle or blocked", () => {
    expect(shouldQueueSuggestionReply({ busy: false, workflowStatus: "done" })).toBe(false);
    expect(shouldQueueSuggestionReply({ workflowStatus: "blocked" })).toBe(false);
    expect(shouldQueueSuggestionReply({})).toBe(false);
  });
});
