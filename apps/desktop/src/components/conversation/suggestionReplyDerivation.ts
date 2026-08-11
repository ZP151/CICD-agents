import type {
  CommandChipContext,
  SuggestionReply,
  SuggestionReplyAction,
  SuggestionReplyContext,
} from "./suggestionReplyTypes.js";
import {
  addCiSuggestions,
  addCommitSuggestions,
  addGitSuggestions,
  addPrSuggestions,
} from "./suggestionReplyWorkflowSuggestions.js";

export function deriveCommandChips(context: CommandChipContext): SuggestionReply[] {
  if (context.inputValue?.trim()) return [];

  const commands: SuggestionReply[] = [
    {
      id: "cmd-review-changes",
      label: "Review changes",
      message: "Review my current workspace changes with a diff-aware summary.",
      action: context.hasRepoPath
        ? { kind: "workspace_action", action: "inspect_changes" }
        : { kind: "fill_composer" },
    },
    {
      id: "cmd-explain-architecture",
      label: "Explain architecture",
      message: "Explain this project architecture using the current repository context.",
      action: context.hasRepoPath
        ? { kind: "workspace_action", action: "inspect_architecture_context" }
        : { kind: "fill_composer" },
    },
    {
      id: "cmd-run-tests",
      label: "Run tests",
      message: "Run the relevant tests for the current change and summarize failures with file references.",
      action: context.hasRepoPath ? { kind: "workspace_action", action: "run_tests" } : { kind: "fill_composer" },
    },
  ];

  if (context.hasAdoLink) {
    commands.push(
      {
        id: "cmd-pr-insight",
        label: "PR insight",
        message: "Inspect pull request insight for the active Azure DevOps context.",
        action: { kind: "workspace_action", action: "inspect_pr_insight" },
      },
      {
        id: "cmd-ado-policy",
        label: "Pipeline",
        message: "Inspect Azure DevOps pipeline readiness for this project link.",
        action: { kind: "workspace_action", action: "inspect_pipeline" },
      },
    );
  }

  return commands.slice(0, 5);
}

export function deriveSuggestionReplies(context: SuggestionReplyContext): SuggestionReply[] {
  if (context.inputValue?.trim()) return [];
  if (context.pendingTool || context.pendingApprovalTool) return [];

  const suggestions: SuggestionReply[] = [];
  const add = (
    id: string,
    label: string,
    message: string,
    action: SuggestionReplyAction = { kind: "fill_composer" },
  ): void => {
    const normalizedLabel = label.trim().toLowerCase();
    if (suggestions.some((suggestion) => (
      suggestion.id === id
      || suggestion.message === message
      || suggestion.label.trim().toLowerCase() === normalizedLabel
    ))) return;
    suggestions.push({ id, label, message, action });
  };
  const addMetadataSuggestions = (): void => {
    for (const suggestion of context.metadataSuggestions ?? []) {
      const clean = suggestion.trim();
      if (!isActionableNextStep(clean)) continue;
      add(`predicted-${suggestions.length}`, clean, clean);
      if (suggestions.length >= 3) break;
    }
  };

  // The agent's structured suggestions are predictions from the actual turn
  // context. Prefer them over static phrase matching; the rules below remain
  // a useful offline/recovery fallback when the model did not provide enough.
  addMetadataSuggestions();

  const rawText = [
    context.lastUserText,
    context.lastAssistantText,
    ...(context.metadataSuggestions ?? []),
    ...(context.metadataActions ?? []),
  ].filter(Boolean).join("\n");
  const text = rawText.toLowerCase();
  const actions = new Set((context.metadataActions ?? []).map((action) => action.toLowerCase()));
  const sourceTypes = new Set(context.sourceTypes ?? []);
  const phase = (context.workflowPhase ?? "").toLowerCase();
  if (context.hasAuthError || /\b(auth|oauth|pat|token|credential|sign in|permission)\b/.test(text)) {
    add("auth-check", "Check auth", "Check the current Azure DevOps authentication state.", {
      kind: "workspace_action",
      action: "inspect_ado_auth_context",
    });
    add("auth-explain", "Explain auth", "Explain the current Azure DevOps authentication state and what is missing.", {
      kind: "workspace_action",
      action: "inspect_ado_auth_context",
    });
  }

  addCiSuggestions(context, text, phase, add);
  addCommitSuggestions(context, phase, add);
  addGitSuggestions(context, phase, add);
  addPrSuggestions(context, text, add);

  if (
    actions.has("repo_refresh_index")
    || actions.has("refresh repository index")
    || /\b(index|indexed|repo_refresh_index|repository context)\b/.test(text)
  ) {
    add("index-architecture-follow-up", "Check architecture gaps", "Identify unclear parts of the architecture that need deeper inspection.", {
      kind: "workspace_action",
      action: "inspect_architecture_context",
    });
    add("index-request-flow", "Trace request flow", "Explain the main request flow using the repository context.", {
      kind: "workspace_action",
      action: "inspect_architecture_context",
    });
    add("index-test-surface", "Find test surface", "Find the main test/build surface for this architecture.", {
      kind: "workspace_action",
      action: "inspect_architecture_context",
    });
  }

  if (sourceTypes.has("source_document")) {
    add("source-key-files", "List key files", "Show the referenced project files and what each one proves.", {
      kind: "workspace_action",
      action: "inspect_source_context",
    });
    add("source-request-flow", "Trace source flow", "Explain the request flow using the referenced files.", {
      kind: "workspace_action",
      action: "inspect_source_context",
    });
  }

  if (sourceTypes.has("source_url")) {
    add("source-web-summary", "Summarize sources", "Summarize the external sources used in this answer.", {
      kind: "workspace_action",
      action: "inspect_source_context",
    });
  }

  if (context.workflowKind !== "commit" && /\b(review my changes|what changed|diff|modified|unstaged|staged|git_status|git_diff)\b/.test(text)) {
    add("review-diff", "Check detailed diff", "Show a detailed diff-aware review of the current changes.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    add("review-stage", "Stage selected", "Stage only the files that belong to the reviewed change scope.", {
      kind: "workspace_action",
      action: "prepare_commit",
    });
    add("review-message", "Draft commit message", "Generate a commit message from the reviewed diff.", {
      kind: "workspace_action",
      action: "draft_commit_message",
    });
  }

  if (
    context.workflowKind !== "commit" &&
    !phase.includes("pipeline_setup_required") &&
    /\b(pr|pull request|policy|work item|pipeline|build|review queue|insight)\b/.test(text)
  ) {
    add("pr-risks", "Check PR risks", "Summarize the main PR risks and what evidence supports them.", {
      kind: "workspace_action",
      action: "inspect_pr_insight",
    });
    add("pr-policy", "Check policy", "Check pull request policy status.", {
      kind: "workspace_action",
      action: "check_pr_policy",
    });
    add("pr-work-items", "List work items", "List linked work items for this pull request.", {
      kind: "workspace_action",
      action: "list_pr_work_items",
    });
  }

  return suggestions.slice(0, 3);
}

function isActionableNextStep(value: string): boolean {
  if (!value || value.startsWith("Repository context:") || value.length > 90) return false;
  return /^(analyze|check|compare|continue|create|draft|explain|fetch|find|fix|inspect|list|open|prepare|publish|pull|push|refresh|rerun|resolve|review|run|show|stage|summarize|trace|validate)\b/i.test(value);
}
