import type { ChatArtifact } from "./chatConversationTypes.js";

export interface ChatApprovalPayload {
  id: string;
  action: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    nextHint?: string;
  };
  riskLevel: string;
  explanation: string;
}

export interface ChatWorkflowState {
  status: "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";
  currentStep: string;
  completedTools: string[];
  pendingApproval?: ChatApprovalPayload;
}

export type ChatWorkflowAction =
  | "inspect_environment"
  | "inspect_changes"
  | "inspect_staged_changes"
  | "draft_commit_message"
  | "explain_change_scope"
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
  | "checkout_branch"
  | "create_branch"
  | "sync_branch_rebase"
  | "push_branch"
  | "prepare_commit"
  | "run_tests"
  | "run_build"
  | "stage_resolved_conflicts"
  | "continue_rebase"
  | "abort_rebase"
  | "skip_rebase"
  | "continue_merge"
  | "abort_merge"
  | "skip_cherry_pick"
  | "continue_cherry_pick"
  | "abort_cherry_pick"
  | "continue_revert"
  | "abort_revert"
  | "skip_revert"
  | "create_pr"
  | "inspect_pr_insight"
  | "check_pr_policy"
  | "list_pr_work_items"
  | "link_work_item"
  | "inspect_pipeline"
  | "trigger_pipeline";

export interface ChatWorkflowActionInput {
  sessionId?: string | null;
  pullRequestId?: number;
  workItemId?: number;
  branch?: string;
  targetBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
  message?: string;
  paths?: string[];
  includeUnstaged?: boolean;
  commitMode?: "commit" | "commit-push";
  validationScript?: string;
  validationArgs?: string[];
  pipelineId?: number;
}

export interface ChatWorkflowToolResult {
  name: string;
  command: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  returncode: number;
}

export interface ChatWorkflowActionResult {
  ok: boolean;
  action: ChatWorkflowAction;
  sessionId?: string;
  repoPath: string;
  summary: string;
  workflowState: ChatWorkflowState;
  tools: ChatWorkflowToolResult[];
  artifacts?: ChatArtifact[];
}
