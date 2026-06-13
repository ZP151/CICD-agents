export interface SuggestionReply {
  id: string;
  label: string;
  message: string;
  action: SuggestionReplyAction;
}

export type SuggestionReplyAction =
  | { kind: "fill_composer" }
  | {
      kind: "workspace_action";
      action:
        | "inspect_changes"
        | "inspect_environment"
        | "run_tests"
        | "run_build"
        | "refresh_branch"
        | "inspect_pr_insight"
        | "check_pr_policy"
        | "list_pr_work_items";
    }
  | { kind: "requires_approval"; reason: string };

export interface SuggestionReplyContext {
  metadataSuggestions?: string[];
  metadataActions?: string[];
  sourceTypes?: Array<"source_document" | "source_url">;
  lastAssistantText?: string;
  lastUserText?: string;
  workflowStatus?: string;
  workflowKind?: "commit" | "git" | "ado" | "ci" | "pr";
  workflowPhase?: string;
  pendingTool?: string;
  pendingApprovalTool?: string;
  pendingApprovalDescription?: string;
  hasAuthError?: boolean;
  inputValue?: string;
  busy?: boolean;
}

export interface SuggestionReplyBarProps {
  suggestions: SuggestionReply[];
  onPick: (suggestion: SuggestionReply) => void;
}

export interface CommandChipContext {
  hasRepoPath?: boolean;
  hasAdoLink?: boolean;
  inputValue?: string;
  pendingApproval?: boolean;
}

export interface ComposerStateNotice {
  tone: "approval" | "busy" | "queued";
  label: string;
  detail: string;
}

export interface ComposerStateNoticeContext {
  busy?: boolean;
  workflowStatus?: string;
  pendingApproval?: boolean;
  pendingApprovalDescription?: string;
  queuedLabel?: string;
  statusText?: string | null;
}

export interface ComposerInputState {
  inputDisabled: boolean;
  sendDisabled: boolean;
  controlsDisabled: boolean;
  placeholder: string;
  inputTitle?: string;
  sendTitle?: string;
}

export interface ComposerInputStateContext {
  busy?: boolean;
  workflowStatus?: string;
  pendingApproval?: boolean;
  inputValue?: string;
}

export interface CommandChipBarProps {
  commands: SuggestionReply[];
  onPick: (command: SuggestionReply) => void;
  disabled?: boolean;
}

export interface SuggestionReplyQueueContext {
  busy?: boolean;
  workflowStatus?: string;
}

export function shouldQueueSuggestionReply(context: SuggestionReplyQueueContext): boolean {
  return Boolean(context.busy || context.workflowStatus === "planning" || context.workflowStatus === "running");
}

export function deriveComposerStateNotice(context: ComposerStateNoticeContext): ComposerStateNotice | null {
  const workflowBusy = isWorkflowBusy(context.workflowStatus);
  if (context.pendingApproval) {
    return {
      tone: "approval",
      label: "Approval pending",
      detail: context.pendingApprovalDescription ?? "Finish the current approval before starting another action.",
    };
  }
  if (context.queuedLabel) {
    return {
      tone: "queued",
      label: "Queued follow-up",
      detail: context.queuedLabel,
    };
  }
  if (context.busy || workflowBusy) {
    return {
      tone: "busy",
      label: "Working",
      detail: context.statusText ?? "You can queue a follow-up while the current action finishes.",
    };
  }
  return null;
}

export function deriveComposerInputState(context: ComposerInputStateContext): ComposerInputState {
  const workflowBusy = isWorkflowBusy(context.workflowStatus);
  if (context.pendingApproval) {
    return {
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "Approve or cancel the pending action before starting another request.",
      inputTitle: "Finish the current approval first.",
      sendTitle: "Finish the current approval first.",
    };
  }

  if (context.busy || workflowBusy) {
    return {
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "Dev Agent is working...",
      inputTitle: "Dev Agent is working.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    };
  }

  const hasInput = Boolean(context.inputValue?.trim());
  return {
    inputDisabled: false,
    sendDisabled: !hasInput,
    controlsDisabled: false,
    placeholder: "Ask Dev Agent... (Shift+Enter for new line)",
    sendTitle: hasInput ? "Send message" : "Type a message first.",
  };
}

function isWorkflowBusy(status: string | undefined): boolean {
  return status === "planning" || status === "running";
}

export function SuggestionReplyBar({ suggestions, onPick }: SuggestionReplyBarProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onPick(suggestion)}
          className={suggestionButtonClass(suggestion.action)}
          data-action-kind={suggestion.action.kind}
          title={suggestion.message}
        >
          <span className={suggestionActionDotClass(suggestion.action)} aria-hidden="true" />
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

export function CommandChipBar({ commands, onPick, disabled }: CommandChipBarProps) {
  if (commands.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
      {commands.map((command) => (
        <button
          key={command.id}
          type="button"
          onClick={() => onPick(command)}
          disabled={disabled}
          className={commandChipClass(command.action)}
          data-action-kind={command.action.kind}
          title={disabled ? "Finish the current approval first" : command.message}
        >
          <span className="shrink-0 text-[10px] text-[rgb(var(--app-text-subtle))]" aria-hidden="true">
            {commandActionGlyph(command.action)}
          </span>
          {command.label}
        </button>
      ))}
    </div>
  );
}

function suggestionButtonClass(action: SuggestionReplyAction): string {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px";
  if (action.kind === "requires_approval") {
    return `${base} border-amber-500/30 bg-amber-500/10 text-[rgb(var(--app-warning))] hover:bg-amber-500/15`;
  }
  if (action.kind === "workspace_action") {
    return `${base} border-blue-500/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))] hover:border-blue-500/50 hover:bg-[rgb(var(--app-surface-raised))]`;
  }
  return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
}

function commandChipClass(action: SuggestionReplyAction): string {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-subtle))]";
  if (action.kind === "workspace_action") {
    return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:border-blue-500/40 hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
  }
  return `${base} border-[rgb(var(--app-border))] bg-transparent text-[rgb(var(--app-text-subtle))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
}

function suggestionActionDotClass(action: SuggestionReplyAction): string {
  if (action.kind === "requires_approval") return "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500";
  if (action.kind === "workspace_action") return "h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-accent))]";
  return "h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-text-faint))]";
}

function commandActionGlyph(action: SuggestionReplyAction): string {
  if (action.kind === "workspace_action") return "↗";
  if (action.kind === "requires_approval") return "!";
  return "›";
}

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
      action: { kind: "fill_composer" },
    },
    {
      id: "cmd-run-tests",
      label: "Run tests",
      message: "Run the relevant tests for the current change and summarize failures with file references.",
      action: context.hasRepoPath
        ? { kind: "workspace_action", action: "run_tests" }
        : { kind: "fill_composer" },
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
        label: "ADO policy",
        message: "Check Azure DevOps pull request policy status.",
        action: { kind: "workspace_action", action: "check_pr_policy" },
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
    if (suggestions.some((suggestion) => suggestion.id === id || suggestion.message === message)) return;
    suggestions.push({ id, label, message, action });
  };
  const addMetadataSuggestions = (): void => {
    for (const suggestion of context.metadataSuggestions ?? []) {
      const clean = suggestion.trim();
      if (!clean || clean.startsWith("Repository context:") || clean.length > 90) continue;
      add(`meta-${suggestions.length}`, clean, clean);
      if (suggestions.length >= 3) break;
    }
  };

  const text = [
    context.lastUserText,
    context.lastAssistantText,
    ...(context.metadataSuggestions ?? []),
    ...(context.metadataActions ?? []),
  ].filter(Boolean).join("\n").toLowerCase();
  const actions = new Set((context.metadataActions ?? []).map((action) => action.toLowerCase()));
  const sourceTypes = new Set(context.sourceTypes ?? []);
  const phase = (context.workflowPhase ?? "").toLowerCase();

  if (context.hasAuthError || /\b(auth|oauth|pat|token|credential|sign in|permission)\b/.test(text)) {
    add("auth-retry", "Retry auth", "Retry the Azure DevOps operation after checking authentication.");
    add("auth-explain", "Explain auth", "Explain the current Azure DevOps authentication state and what is missing.");
    add("auth-pat", "PAT fallback", "Help me configure the optional Azure DevOps PAT fallback for this project link.");
  }

  if (context.workflowKind === "commit") {
    if (phase.includes("stage") || phase.includes("preflight")) {
      add("commit-diff", "Detailed diff", "Show a detailed diff-aware review before staging.");
      add("commit-message", "Commit message", "Generate a commit message from the reviewed diff.");
      add("commit-scope", "Change scope", "Explain which files should be staged and why.");
    } else if (phase.includes("commit")) {
      add("commit-staged", "Staged diff", "Show the staged diff and summarize commit risk.");
      add("commit-message", "Commit message", "Generate a commit message from the staged changes.");
      add("commit-scope", "Change scope", "Explain what is included in this commit.");
    } else if (phase.includes("pushed") || context.workflowStatus === "done") {
      add("commit-summary", "Push summary", "Summarize the commit and push that just completed.");
      add("commit-branch", "Branch status", "Check the branch status after the push.", {
        kind: "workspace_action",
        action: "refresh_branch",
      });
      add("commit-review", "Review commit", "Review the pushed commit for any remaining risks.");
    } else if (phase.includes("push")) {
      add("commit-push", "Push branch", "Push the committed changes to the configured remote branch.", {
        kind: "requires_approval",
        reason: "Pushing writes to the remote repository.",
      });
      add("commit-remote", "Remote target", "Show the remote branch target and push command.");
      add("commit-status", "Branch status", "Check local branch status before pushing.", {
        kind: "workspace_action",
        action: "refresh_branch",
      });
    }
  }

  if (context.workflowKind === "pr") {
    add("pr-risks", "PR risks", "Summarize the main PR risks and what evidence supports them.", {
      kind: "workspace_action",
      action: "inspect_pr_insight",
    });
    add("pr-policy", "Policy status", "Check pull request policy status.", {
      kind: "workspace_action",
      action: "check_pr_policy",
    });
    add("pr-work-items", "Work items", "List linked work items for this pull request.", {
      kind: "workspace_action",
      action: "list_pr_work_items",
    });
  }

  if (
    actions.has("repo_refresh_index")
    || actions.has("refresh repository index")
    || /\b(index|indexed|repo_refresh_index|repository context)\b/.test(text)
  ) {
    add("index-architecture", "Explain architecture", "Explain this project architecture using the refreshed repository context.");
    add("index-files", "Show indexed files", "Show the key indexed files and why they matter.");
    add("index-refresh", "Refresh index", "Refresh the repository index again and summarize what changed.");
  }

  if (sourceTypes.has("source_document")) {
    add("source-key-files", "Key files", "Show the referenced project files and what each one proves.");
    add("source-request-flow", "Request flow", "Explain the request flow using the referenced files.");
  }

  if (sourceTypes.has("source_url")) {
    add("source-web-summary", "Source summary", "Summarize the external sources used in this answer.");
  }

  if (context.workflowKind !== "commit" && /\b(review my changes|what changed|diff|modified|unstaged|staged|git_status|git_diff)\b/.test(text)) {
    add("review-diff", "Detailed diff", "Show a detailed diff-aware review of the current changes.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    add("review-stage", "Stage selected", "Stage only the files that belong to the reviewed change scope.", {
      kind: "requires_approval",
      reason: "Staging changes writes to the local Git index.",
    });
    add("review-message", "Commit message", "Generate a commit message from the reviewed diff.");
  }

  if (/\b(architecture|entry point|request flow|project structure|controller|daemon|api)\b/.test(text)) {
    add("arch-files", "Key files", "Show the key files for this project and what each one does.");
    add("arch-flow", "Request flow", "Explain the main request flow through this project.");
    add("arch-entry", "Entry points", "Find the main entry points and startup path.");
  }

  if (context.workflowKind !== "commit" && /\b(pr|pull request|policy|work item|pipeline|build|review queue|insight)\b/.test(text)) {
    add("pr-risks", "PR risks", "Summarize the main PR risks and what evidence supports them.", {
      kind: "workspace_action",
      action: "inspect_pr_insight",
    });
    add("pr-policy", "Policy status", "Check pull request policy status.", {
      kind: "workspace_action",
      action: "check_pr_policy",
    });
    add("pr-work-items", "Work items", "List linked work items for this pull request.", {
      kind: "workspace_action",
      action: "list_pr_work_items",
    });
  }

  addMetadataSuggestions();

  return suggestions.slice(0, 3);
}
