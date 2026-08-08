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
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "prepare_commit" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "draft_commit_message" });
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
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
    ]);
  });

  it("suggests auth recovery without showing generic actions", () => {
    const suggestions = deriveSuggestionReplies({
      hasAuthError: true,
      lastAssistantText: "Azure DevOps OAuth token is unavailable.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check auth",
      "Explain auth",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_ado_auth_context" },
      { kind: "workspace_action", action: "inspect_ado_auth_context" },
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
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_staged_changes" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "draft_commit_message" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "explain_change_scope" });
  });

  it("routes commit preflight detailed diff through structured inspection", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "commit",
      workflowPhase: "stage_preflight",
      lastAssistantText: "The changes have been reviewed before staging.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Check detailed diff",
      "Draft commit message",
      "Explain change scope",
    ]);
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_changes" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "draft_commit_message" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "explain_change_scope" });
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
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_latest_commit" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "refresh_branch" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "inspect_latest_commit" });
    expect(suggestions.map((suggestion) => suggestion.message).join(" ")).not.toMatch(/pull request|work item|pipeline/i);
  });

  it("routes push suggestions through structured workflow approvals", () => {
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
      kind: "workspace_action",
      action: "push_branch",
    });
    expect(suggestions[1]?.action).toEqual({
      kind: "workspace_action",
      action: "inspect_remote_target",
    });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "refresh_branch" });
  });

  it("routes passed validation follow-ups as structured commit and PR actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "test_passed",
      workflowStatus: "done",
      lastAssistantText: "Validation passed.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Review changes",
      "Prepare commit",
      "Check PR readiness",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_changes" },
      { kind: "workspace_action", action: "prepare_commit" },
      { kind: "workspace_action", action: "inspect_pr_insight" },
    ]);
  });

  it("routes fetched Git workflow follow-ups as structured workspace actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "git",
      workflowPhase: "fetched",
      workflowStatus: "done",
      lastAssistantText: "Fetched latest refs from origin. Refresh branch status next.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Refresh branch status",
      "Pull/rebase first",
      "Push branch",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "refresh_branch" },
      { kind: "workspace_action", action: "sync_branch_rebase" },
      { kind: "workspace_action", action: "push_branch" },
    ]);
  });

  it("routes synced Git workflow follow-ups as structured workspace actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "git",
      workflowPhase: "synced",
      workflowStatus: "done",
      lastAssistantText: "Branch main has been updated with rebase.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Refresh branch status",
      "Push branch",
      "Fetch remotes",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "refresh_branch" },
      { kind: "workspace_action", action: "push_branch" },
      { kind: "workspace_action", action: "fetch_remotes" },
    ]);
  });

  it("routes rebase conflict recovery follow-ups as structured workspace actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "git",
      workflowPhase: "rebase_conflict",
      workflowStatus: "blocked",
      lastAssistantText: "Git is in rebase with unresolved conflicts: app.config.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Continue rebase",
      "Abort rebase",
      "Skip rebase patch",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "continue_rebase" },
      { kind: "workspace_action", action: "abort_rebase" },
      { kind: "workspace_action", action: "skip_rebase" },
    ]);
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

  it("routes ready PR plan follow-ups to push and create PR actions", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "pr",
      workflowPhase: "pr_plan_context_inspected",
      workflowStatus: "done",
      lastAssistantText: [
        "PR plan context:",
        "- Source branch: feature/review",
        "- Target branch: main",
        "- Azure DevOps target: Demo/DemoRepo",
        "- Working tree: clean",
        "- Push readiness: Branch is ahead of origin/main by 1 commit.",
        "- PR readiness: Ready to create PR feature/review -> main in Demo/DemoRepo.",
      ].join("\n"),
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Push branch",
      "Create PR",
      "Check PR risks",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "push_branch" },
      { kind: "workspace_action", action: "create_pr" },
      { kind: "workspace_action", action: "inspect_pr_insight" },
    ]);
  });

  it("routes dirty PR plan follow-ups to review, commit, and ADO context first", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "pr",
      workflowPhase: "pr_plan_context_inspected",
      workflowStatus: "done",
      lastAssistantText: [
        "PR plan context:",
        "- Source branch: feature/review",
        "- Target branch: main",
        "- Azure DevOps target: missing",
        "- Working tree: 2 modified, 1 untracked",
        "- PR readiness: missing_ado_mapping. Complete Project Link mapping before creating the PR.",
      ].join("\n"),
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Review changes",
      "Prepare commit",
      "Check ADO context",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_changes" },
      { kind: "workspace_action", action: "prepare_commit" },
      { kind: "workspace_action", action: "inspect_ado_auth_context" },
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
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_ci_recovery_context" });
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
      "Check PR risks",
      "Rerun validation",
      "Check policy",
    ]);
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_pr_insight" },
      { kind: "workspace_action", action: "run_tests" },
      { kind: "workspace_action", action: "check_pr_policy" },
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
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_validation_failure" });
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
    expect(suggestions[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_pipeline" });
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "trigger_pipeline" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
  });

  it("no longer offers to save a discovered pipeline candidate (V2 Project Links never persist pipeline fields)", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "pipeline_setup_required",
      workflowStatus: "done",
      lastAssistantText: [
        "No Azure Pipeline is configured on this Project Link yet.",
        "Select a pipeline for this Project Link before inspecting or running CI.",
        "",
        "Available pipeline candidates:",
        "- #117 ClaimBot_API - repo:CICD-agents · type:TfsGit · yaml:/azure-pipelines.yml",
      ].join("\n"),
    });

    expect(suggestions).toEqual([]);
  });

  it("does not suggest saving the already configured pipeline candidate", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "ci",
      workflowPhase: "pipeline_setup_required",
      workflowStatus: "done",
      adoPipelineId: "117",
      lastAssistantText: [
        "No Azure Pipeline is configured on this Project Link yet.",
        "Available pipeline candidates:",
        "- #117 ClaimBot_API - repo:CICD-agents · type:TfsGit · yaml:/azure-pipelines.yml",
      ].join("\n"),
    });

    expect(suggestions).toEqual([]);
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
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
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
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
      { kind: "workspace_action", action: "inspect_architecture_context" },
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
    expect(suggestions.map((suggestion) => suggestion.action)).toEqual([
      { kind: "workspace_action", action: "inspect_source_context" },
      { kind: "workspace_action", action: "inspect_source_context" },
      { kind: "workspace_action", action: "inspect_source_context" },
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
