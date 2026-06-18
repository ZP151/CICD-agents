import type { WorkspaceAction } from "./workflowTaskState.js";
import type { DirectWorkflowAction } from "./workspaceActionTypes.js";

export function workspaceActionToDirectWorkflow(action: WorkspaceAction): DirectWorkflowAction {
  switch (action.type) {
    case "inspect_environment":
      return { action: "inspect_environment" };
    case "inspect_changes":
      return { action: "inspect_changes" };
    case "run_tests":
      return { action: "run_tests" };
    case "run_build":
      return { action: "run_build" };
    case "refresh_branch":
      return { action: "refresh_branch" };
    case "checkout_branch":
      return { action: "checkout_branch", input: { branch: action.branch } };
    case "create_branch":
      return { action: "create_branch", input: { branch: action.branch } };
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
