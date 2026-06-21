import type { SuggestionReply } from "../../components/conversation/SuggestionReplyBar.js";
import type { WorkspaceAction } from "./workflowTaskState.js";

export function workspaceActionFromSuggestion(suggestion: SuggestionReply): WorkspaceAction | null {
  if (suggestion.action.kind !== "workspace_action") return null;
  switch (suggestion.action.action) {
    case "inspect_changes":
      return { type: "inspect_changes" };
    case "inspect_staged_changes":
      return { type: "inspect_staged_changes" };
    case "draft_commit_message":
      return { type: "draft_commit_message" };
    case "explain_change_scope":
      return { type: "explain_change_scope" };
    case "inspect_environment":
      return { type: "inspect_environment" };
    case "run_tests":
      return { type: "run_tests" };
    case "run_build":
      return { type: "run_build" };
    case "refresh_branch":
      return { type: "refresh_branch" };
    case "inspect_remote_target":
      return { type: "inspect_remote_target" };
    case "inspect_latest_commit":
      return { type: "inspect_latest_commit" };
    case "fetch_remotes":
      return { type: "fetch_remotes" };
    case "inspect_validation_failure":
      return { type: "inspect_validation_failure" };
    case "inspect_ci_recovery_context":
      return { type: "inspect_ci_recovery_context" };
    case "inspect_source_context":
      return { type: "inspect_source_context" };
    case "inspect_architecture_context":
      return { type: "inspect_architecture_context" };
    case "inspect_ado_auth_context":
      return { type: "inspect_ado_auth_context" };
    case "inspect_pr_plan_context":
      return { type: "inspect_pr_plan_context" };
    case "sync_branch_rebase":
      return { type: "sync_branch_rebase" };
    case "prepare_commit":
      return { type: "prepare_commit", includeUnstaged: true };
    case "push_branch":
      return { type: "push_branch" };
    case "inspect_pr_insight":
      return { type: "inspect_pr_insight" };
    case "check_pr_policy":
      return { type: "check_pr_policy" };
    case "list_pr_work_items":
      return { type: "list_pr_work_items" };
    case "inspect_pipeline":
      return { type: "inspect_pipeline" };
    case "trigger_pipeline":
      return { type: "trigger_pipeline" };
  }
  return null;
}

export function workspaceActionFromWelcomeSuggestion(suggestion: string): WorkspaceAction | null {
  if (/^(understand this project|explain this project architecture)$/i.test(suggestion)) {
    return { type: "inspect_architecture_context" };
  }
  if (/^review my changes$/i.test(suggestion)) return { type: "inspect_changes" };
  if (/^what'?s on this branch\??$/i.test(suggestion)) return { type: "refresh_branch" };
  if (/^analyze pr insight for this repo$/i.test(suggestion)) return { type: "inspect_pr_insight" };
  if (/^check the ci\/cd pipeline state$/i.test(suggestion)) return { type: "inspect_pipeline" };
  if (/^find the build and test commands$/i.test(suggestion)) return { type: "inspect_architecture_context" };
  if (/^stage and commit$/i.test(suggestion)) return { type: "prepare_commit", includeUnstaged: true };
  if (/^(prepare a pr plan|push and create pr)$/i.test(suggestion)) return { type: "inspect_pr_plan_context" };
  if (/^run tests$/i.test(suggestion)) return { type: "run_tests" };
  return null;
}
