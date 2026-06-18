import type { WorkflowStatus } from "./chat.types.js";

export type WorkspaceAction =
  | { type: "inspect_environment" }
  | { type: "inspect_changes" }
  | { type: "refresh_branch" }
  | { type: "checkout_branch"; branch: string }
  | { type: "create_branch"; branch: string }
  | { type: "continue_rebase" }
  | { type: "abort_rebase" }
  | { type: "skip_rebase" }
  | { type: "continue_merge" }
  | { type: "abort_merge" }
  | { type: "continue_cherry_pick" }
  | { type: "abort_cherry_pick" }
  | { type: "skip_cherry_pick" }
  | { type: "continue_revert" }
  | { type: "abort_revert" }
  | { type: "skip_revert" }
  | { type: "create_pr"; branch?: string; targetBranch?: string; title?: string; description?: string; draft?: boolean }
  | { type: "inspect_pr_insight"; pullRequestId?: number }
  | { type: "check_pr_policy"; pullRequestId?: number }
  | { type: "list_pr_work_items"; pullRequestId?: number }
  | { type: "link_work_item"; pullRequestId?: number; workItemId: number }
  | { type: "inspect_pipeline"; pipelineId?: number }
  | { type: "trigger_pipeline"; pipelineId?: number; branch?: string }
  | { type: "prepare_commit"; branch?: string; message?: string; includeUnstaged: boolean }
  | { type: "commit_and_push"; branch?: string; message?: string; includeUnstaged: boolean }
  | { type: "push_branch"; branch?: string }
  | { type: "run_tests" }
  | { type: "run_build" };

export interface WorkflowStep {
  label: string;
  done: boolean;
  active: boolean;
  action?: WorkspaceAction;
}

export interface TaskState {
  goal: string;
  steps: WorkflowStep[];
  currentStepLabel: string;
  details?: string[];
  risk?: string;
}

export type WorkflowStepActionState = "idle" | "running" | "waiting" | "done" | "blocked";

export interface WorkflowStepActionStateContext {
  busy?: boolean;
  workflowStatus?: WorkflowStatus | string;
}

export type GitRecoveryWorkspaceAction = Extract<
  WorkspaceAction,
  {
    type:
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
      | "skip_revert";
  }
>;
