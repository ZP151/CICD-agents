import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CommandChipBar,
  SuggestionReplyBar,
  deriveCommandChips,
  deriveComposerInputState,
  deriveComposerStateNotice,
  deriveSuggestionReplies,
  shouldQueueSuggestionReply,
  suggestionReplyButtonState,
} from "./SuggestionReplyBar.js";

describe("deriveSuggestionReplies", () => {
  it("suggests diff-aware follow-ups for review contexts", () => {
    const suggestions = deriveSuggestionReplies({
      lastUserText: "Review my changes",
      lastAssistantText: "git_status found modified files and git_diff inspected the diff.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Detailed diff",
      "Stage selected",
      "Commit message",
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

    expect(suggestions.map((suggestion) => suggestion.label)).toContain("Key files");
    expect(suggestions.map((suggestion) => suggestion.label)).toContain("Request flow");
  });

  it("suggests auth recovery without showing generic actions", () => {
    const suggestions = deriveSuggestionReplies({
      hasAuthError: true,
      lastAssistantText: "Azure DevOps OAuth token is unavailable.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Retry auth",
      "Explain auth",
      "PAT fallback",
    ]);
  });

  it("hides suggestions while typing or waiting for approval", () => {
    expect(deriveSuggestionReplies({ lastUserText: "review my changes", inputValue: "r" })).toEqual([]);
    expect(deriveSuggestionReplies({ lastUserText: "review my changes", pendingTool: "git_add" })).toEqual([]);
  });

  it("keeps suggestions visible while busy so they can be queued", () => {
    const suggestions = deriveSuggestionReplies({ lastUserText: "review my changes", busy: true });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Detailed diff",
      "Stage selected",
      "Commit message",
    ]);
  });

  it("uses commit workflow metadata before text fallback", () => {
    const suggestions = deriveSuggestionReplies({
      workflowKind: "commit",
      workflowPhase: "waiting_for_commit_approval",
      lastAssistantText: "The selected files are ready.",
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Staged diff",
      "Commit message",
      "Change scope",
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
      "Push summary",
      "Branch status",
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
      "Remote target",
      "Branch status",
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
      "Policy status",
      "Work items",
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
      "Policy status",
      "Work items",
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
      "Local validation",
    ]);
    expect(suggestions[1]?.action).toEqual({ kind: "workspace_action", action: "trigger_pipeline" });
    expect(suggestions[2]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
  });

  it("uses repository index actions and source metadata", () => {
    const suggestions = deriveSuggestionReplies({
      metadataActions: ["repo_refresh_index"],
      sourceTypes: ["source_document"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Explain architecture",
      "Show indexed files",
      "Refresh index",
    ]);
  });

  it("suggests source-focused follow-ups from document and url source metadata", () => {
    const suggestions = deriveSuggestionReplies({
      sourceTypes: ["source_document", "source_url"],
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Key files",
      "Request flow",
      "Source summary",
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

describe("deriveCommandChips", () => {
  it("derives compact default command chips", () => {
    const commands = deriveCommandChips({ hasRepoPath: true });

    expect(commands.map((command) => command.label)).toEqual([
      "Review changes",
      "Explain architecture",
      "Run tests",
    ]);
    expect(commands[0]?.action).toEqual({ kind: "workspace_action", action: "inspect_changes" });
    expect(commands[1]?.action).toEqual({ kind: "fill_composer" });
    expect(commands[2]?.action).toEqual({ kind: "workspace_action", action: "run_tests" });
  });

  it("adds Azure DevOps command chips only when an ADO link exists", () => {
    const commands = deriveCommandChips({ hasRepoPath: true, hasAdoLink: true });

    expect(commands.map((command) => command.label)).toEqual([
      "Review changes",
      "Explain architecture",
      "Run tests",
      "PR insight",
      "Pipeline",
    ]);
    expect(commands[3]?.action).toEqual({ kind: "workspace_action", action: "inspect_pr_insight" });
    expect(commands[4]?.action).toEqual({ kind: "workspace_action", action: "inspect_pipeline" });
  });

  it("hides command chips while the user is typing", () => {
    expect(deriveCommandChips({ hasRepoPath: true, inputValue: "review" })).toEqual([]);
  });

  it("falls back to composer-fill for repo commands when no repository is active", () => {
    const commands = deriveCommandChips({ hasRepoPath: false });

    expect(commands[0]?.label).toBe("Review changes");
    expect(commands[0]?.action).toEqual({ kind: "fill_composer" });
  });
});

describe("deriveComposerStateNotice", () => {
  it("prioritizes approval state", () => {
    expect(deriveComposerStateNotice({
      busy: true,
      pendingApproval: true,
      pendingApprovalDescription: "Approve staging selected files",
      queuedLabel: "Review changes",
    })).toEqual({
      tone: "approval",
      label: "Approval pending",
      detail: "Approve staging selected files",
    });
  });

  it("shows queued state before busy state", () => {
    expect(deriveComposerStateNotice({
      busy: true,
      queuedLabel: "Review changes",
      statusText: "Running git status",
    })).toEqual({
      tone: "queued",
      label: "Queued follow-up",
      detail: "Review changes",
    });
  });

  it("shows busy state and falls back to a helpful detail", () => {
    expect(deriveComposerStateNotice({ busy: true })).toEqual({
      tone: "busy",
      label: "Working",
      detail: "You can queue a follow-up while the current action finishes.",
    });
  });

  it("treats running workflow state as busy even after restoring a session", () => {
    expect(deriveComposerStateNotice({
      workflowStatus: "running",
      statusText: "Inspecting workspace",
    })).toEqual({
      tone: "busy",
      label: "Working",
      detail: "Inspecting workspace",
    });
  });

  it("does not show a notice while idle", () => {
    expect(deriveComposerStateNotice({ busy: false })).toBeNull();
  });
});

describe("deriveComposerInputState", () => {
  it("blocks new input while an approval is pending", () => {
    expect(deriveComposerInputState({
      pendingApproval: true,
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "Approve or cancel the pending action before starting another request.",
      inputTitle: "Finish the current approval first.",
      sendTitle: "Finish the current approval first.",
    });
  });

  it("blocks input while the agent is working", () => {
    expect(deriveComposerInputState({
      busy: true,
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "MergePilot is working...",
      inputTitle: "MergePilot is working.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    });
  });

  it("blocks input while a restored workflow is still running", () => {
    expect(deriveComposerInputState({
      workflowStatus: "running",
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "MergePilot is working...",
      inputTitle: "MergePilot is working.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    });
  });

  it("enables send only when idle input has content", () => {
    expect(deriveComposerInputState({ inputValue: "" })).toMatchObject({
      inputDisabled: false,
      sendDisabled: true,
      controlsDisabled: false,
      sendTitle: "Type a message first.",
    });
    expect(deriveComposerInputState({ inputValue: "review my changes" })).toMatchObject({
      inputDisabled: false,
      sendDisabled: false,
      controlsDisabled: false,
      sendTitle: "Send message",
    });
  });
});

describe("SuggestionReplyBar", () => {
  const workspaceSuggestion = {
    id: "pr-rerun-validation",
    label: "Rerun validation",
    message: "Rerun relevant validation.",
    action: { kind: "workspace_action" as const, action: "run_tests" as const },
  };

  it("renders suggestion buttons", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[
          { id: "a", label: "Key files", message: "Show key files", action: { kind: "fill_composer" } },
          { id: "b", label: "Request flow", message: "Explain request flow", action: { kind: "fill_composer" } },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain("Key files");
    expect(html).toContain("Request flow");
    expect(html).toContain("Show key files");
    expect(html).toContain('data-action-kind="fill_composer"');
  });

  it("marks workspace and approval suggestions with action kind hooks", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[
          {
            id: "a",
            label: "Detailed diff",
            message: "Inspect current changes",
            action: { kind: "workspace_action", action: "inspect_changes" },
          },
          {
            id: "b",
            label: "Stage selected",
            message: "Stage selected files",
            action: { kind: "requires_approval", reason: "Staging writes to the Git index." },
          },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain('data-action-kind="workspace_action"');
    expect(html).toContain('data-action-kind="requires_approval"');
  });

  it("derives visible suggestion button state from workflow context", () => {
    expect(suggestionReplyButtonState(workspaceSuggestion, undefined)).toBe("idle");
    expect(suggestionReplyButtonState(workspaceSuggestion, { workflowStatus: "running" })).toBe("running");
    expect(suggestionReplyButtonState(workspaceSuggestion, { queuedSuggestionId: workspaceSuggestion.id })).toBe("queued");
    expect(suggestionReplyButtonState(workspaceSuggestion, { blocked: true })).toBe("blocked");
  });

  it("marks running suggestions as queueable without disabling them", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ workflowStatus: "running" }}
      />,
    );

    expect(html).toContain('data-suggestion-state="running"');
    expect(html).toContain("Queue");
    expect(html).toContain("Queue after current workflow");
    expect(html).not.toContain('disabled=""');
  });

  it("marks queued and blocked suggestions as disabled stateful actions", () => {
    const queuedHtml = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ queuedSuggestionId: workspaceSuggestion.id }}
      />,
    );
    const blockedHtml = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ blocked: true, blockedReason: "Resolve git conflicts first." }}
      />,
    );

    expect(queuedHtml).toContain('data-suggestion-state="queued"');
    expect(queuedHtml).toContain("Queued");
    expect(queuedHtml).toContain("disabled");
    expect(blockedHtml).toContain('data-suggestion-state="blocked"');
    expect(blockedHtml).toContain("Blocked");
    expect(blockedHtml).toContain("Resolve git conflicts first.");
    expect(blockedHtml).toContain("disabled");
  });
});

describe("CommandChipBar", () => {
  it("renders disabled command chips without dropping labels", () => {
    const html = renderToStaticMarkup(
      <CommandChipBar
        disabled
        commands={[
          {
            id: "cmd-review",
            label: "Review changes",
            message: "Review my changes",
            action: { kind: "workspace_action", action: "inspect_changes" },
          },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain("Review changes");
    expect(html).toContain("disabled");
    expect(html).toContain("Finish the current approval first");
    expect(html).toContain('data-action-kind="workspace_action"');
  });
});
