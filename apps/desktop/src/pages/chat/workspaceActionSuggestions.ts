import type { SuggestionReply } from "../../components/conversation/SuggestionReplyBar.js";
import type { WorkspaceAction } from "./workflowTaskState.js";

export function workspaceActionFromSuggestion(suggestion: SuggestionReply): WorkspaceAction | null {
  if (suggestion.action.kind !== "workspace_action") return null;
  switch (suggestion.action.action) {
    case "inspect_changes":
      return { type: "inspect_changes" };
    case "inspect_environment":
      return { type: "inspect_environment" };
    case "run_tests":
      return { type: "run_tests" };
    case "run_build":
      return { type: "run_build" };
    case "refresh_branch":
      return { type: "refresh_branch" };
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
  if (/^run tests$/i.test(suggestion)) return { type: "run_tests" };
  return null;
}
