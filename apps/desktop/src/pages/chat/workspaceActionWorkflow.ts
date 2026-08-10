import type { WorkspaceAction } from "./workflowTaskState.js";
import type { DirectWorkflowAction } from "./workspaceActionTypes.js";

export function workspaceActionToDirectWorkflow(action: WorkspaceAction): DirectWorkflowAction {
  switch (action.type) {
    case "inspect_environment":
      return { action: "inspect_environment" };
    case "inspect_changes":
      return { action: "inspect_changes" };
    case "inspect_staged_changes":
      return { action: "inspect_staged_changes" };
    case "draft_commit_message":
      return { action: "draft_commit_message" };
    case "explain_change_scope":
      return { action: "explain_change_scope" };
    case "run_tests":
      return { action: "run_tests" };
    case "run_build":
      return { action: "run_build" };
    case "refresh_branch":
      return { action: "refresh_branch" };
    case "inspect_remote_target":
      return { action: "inspect_remote_target" };
    case "inspect_latest_commit":
      return { action: "inspect_latest_commit" };
    case "fetch_remotes":
      return { action: "fetch_remotes" };
    case "inspect_validation_failure":
      return { action: "inspect_validation_failure" };
    case "inspect_ci_recovery_context":
      return { action: "inspect_ci_recovery_context" };
    case "inspect_source_context":
      return { action: "inspect_source_context" };
    case "inspect_architecture_context":
      return { action: "inspect_architecture_context" };
    case "inspect_ado_auth_context":
      return { action: "inspect_ado_auth_context" };
    case "inspect_pr_plan_context":
      return { action: "inspect_pr_plan_context" };
    case "checkout_branch":
      return { action: "checkout_branch", input: { branch: action.branch } };
    case "create_branch":
      return { action: "create_branch", input: { branch: action.branch } };
    case "sync_branch_rebase":
      return { action: "sync_branch_rebase", input: { branch: action.branch } };
    case "continue_rebase":
      return { action: "continue_rebase" };
    case "abort_rebase":
      return { action: "abort_rebase" };
    case "skip_rebase":
      return { action: "skip_rebase" };
    case "continue_merge":
      return { action: "continue_merge" };
    case "abort_merge":
      return { action: "abort_merge" };
    case "continue_cherry_pick":
      return { action: "continue_cherry_pick" };
    case "abort_cherry_pick":
      return { action: "abort_cherry_pick" };
    case "skip_cherry_pick":
      return { action: "skip_cherry_pick" };
    case "continue_revert":
      return { action: "continue_revert" };
    case "abort_revert":
      return { action: "abort_revert" };
    case "skip_revert":
      return { action: "skip_revert" };
    case "create_pr":
      return {
        action: "create_pr",
        input: {
          branch: action.branch,
          targetBranch: action.targetBranch,
          title: action.title,
          description: action.description,
          draft: action.draft,
        },
      };
    case "inspect_pr_insight":
      return { action: "inspect_pr_insight", input: { pullRequestId: action.pullRequestId } };
    case "check_pr_policy":
      return { action: "check_pr_policy", input: { pullRequestId: action.pullRequestId } };
    case "list_pr_work_items":
      return { action: "list_pr_work_items", input: { pullRequestId: action.pullRequestId } };
    case "link_work_item":
      return { action: "link_work_item", input: { pullRequestId: action.pullRequestId, workItemId: action.workItemId } };
    case "inspect_pipeline":
      return { action: "inspect_pipeline", input: { pipelineId: action.pipelineId } };
    case "trigger_pipeline":
      return { action: "trigger_pipeline", input: { pipelineId: action.pipelineId, branch: action.branch } };
    case "push_branch":
      return { action: "push_branch", input: { branch: action.branch } };
    case "commit_and_push":
      return {
        action: "prepare_commit",
        input: {
          branch: action.branch,
          message: action.message,
          includeUnstaged: action.includeUnstaged,
          commitMode: "commit-push",
        },
      };
    case "prepare_commit":
      return {
        action: "prepare_commit",
        input: {
          branch: action.branch,
          message: action.message,
          includeUnstaged: action.includeUnstaged,
          commitMode: "commit",
        },
      };
  }
}

export function pullRequestPlanningPrompt(action: Extract<WorkspaceAction, { type: "create_pr" }>): string {
  const source = action.branch?.trim() || "the current branch";
  const target = action.targetBranch?.trim() || "the configured target branch";
  const titleHint = action.title?.trim() ? ` The tentative title is “${action.title.trim()}”.` : "";
  return `Prepare a pull request from ${source} to ${target}.${titleHint} First inspect the local working tree, branch tracking, remote target, latest commit, and any existing pull request. Summarize blockers and the proposed title/body, then wait for my confirmation before creating anything.`;
}
