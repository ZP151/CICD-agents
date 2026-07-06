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
        | "inspect_staged_changes"
        | "draft_commit_message"
        | "explain_change_scope"
        | "inspect_environment"
        | "run_tests"
        | "run_build"
        | "refresh_branch"
        | "inspect_remote_target"
        | "inspect_latest_commit"
        | "fetch_remotes"
        | "inspect_validation_failure"
        | "inspect_ci_recovery_context"
        | "inspect_source_context"
        | "inspect_architecture_context"
        | "inspect_ado_auth_context"
        | "inspect_pr_plan_context"
        | "sync_branch_rebase"
        | "continue_rebase"
        | "abort_rebase"
        | "skip_rebase"
        | "continue_merge"
        | "abort_merge"
        | "continue_cherry_pick"
        | "abort_cherry_pick"
        | "skip_cherry_pick"
        | "continue_revert"
        | "abort_revert"
        | "skip_revert"
        | "prepare_commit"
        | "push_branch"
        | "create_pr"
        | "inspect_pr_insight"
        | "check_pr_policy"
        | "list_pr_work_items"
        | "inspect_pipeline"
        | "trigger_pipeline";
    }
  | {
      kind: "project_link_update";
      update: {
        adoPipelineId?: string;
        adoPipelineName?: string;
      };
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
  adoPipelineId?: string;
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
  state?: SuggestionReplyBarState;
}

export interface SuggestionReplyBarState {
  busy?: boolean;
  workflowStatus?: string;
  queuedSuggestionId?: string;
  blocked?: boolean;
  blockedReason?: string;
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

export type SuggestionReplyButtonState = "idle" | "running" | "queued" | "blocked";
