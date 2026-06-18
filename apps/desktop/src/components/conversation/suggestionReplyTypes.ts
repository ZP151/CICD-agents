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
        | "list_pr_work_items"
        | "inspect_pipeline"
        | "trigger_pipeline";
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
