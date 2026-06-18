import type { ApprovalRequest } from "./chat.types.js";
import type { WorkspaceAction } from "./workflowTaskState.js";

export function workspaceActionToolCandidates(action: WorkspaceAction): string[] {
  switch (action.type) {
    case "inspect_environment":
      return ["git_status", "git_diff", "git_current_branch", "git_branch_list", "git_remote"];
    case "run_tests":
    case "run_build":
      return ["validation_command", "npm_test", "npm_build", "pytest_run", "dotnet_test", "dotnet_build"];
    case "inspect_changes":
      return ["git_status", "git_diff"];
    case "refresh_branch":
      return ["git_current_branch", "git_branch_list"];
    case "checkout_branch":
      return ["git_checkout", "git_switch"];
    case "create_branch":
      return ["git_create_branch", "git_checkout"];
    case "continue_rebase":
    case "abort_rebase":
    case "skip_rebase":
      return ["git_rebase"];
    case "continue_merge":
    case "abort_merge":
      return ["git_merge"];
    case "continue_cherry_pick":
    case "abort_cherry_pick":
    case "skip_cherry_pick":
      return ["git_cherry_pick"];
    case "continue_revert":
    case "abort_revert":
    case "skip_revert":
      return ["git_revert"];
    case "create_pr":
      return ["ado_create_pr"];
    case "inspect_pr_insight":
      return [
        "ado_get_pull_request_by_id",
        "ado_list_pull_request_threads",
        "ado_get_pull_request_changes",
        "ado_pipelines_get_builds",
        "ado_list_pull_request_work_items",
        "ado_list_pull_request_policy_evaluations",
      ];
    case "check_pr_policy":
      return ["ado_list_pull_request_policy_evaluations"];
    case "list_pr_work_items":
      return ["ado_list_pull_request_work_items"];
    case "link_work_item":
      return ["ado_link_work_item"];
    case "inspect_pipeline":
      return ["ado_list_pipeline_runs", "ado_get_build_timeline", "ado_get_build_log_excerpt"];
    case "trigger_pipeline":
      return ["ado_trigger_pipeline"];
    case "push_branch":
      return ["git_push"];
    case "commit_and_push":
      return ["git_add", "git_commit", "git_push"];
    case "prepare_commit":
      return ["git_add", "git_commit"];
  }
}

export function workspaceActionMatchesApproval(action: WorkspaceAction, approval: ApprovalRequest): boolean {
  return workspaceActionToolCandidates(action).includes(approval.action.tool);
}
