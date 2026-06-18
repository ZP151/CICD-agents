import type { ChatMessage, ChatPlannerResult } from "./chatPlannerTypes.js";

export function requiredChangeInspectionGuidance(
  toolName: string,
  args: Record<string, unknown>,
  message: string,
  history: ChatMessage[],
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
): string {
  if (!["git_add", "git_commit", "git_push"].includes(toolName)) return "";
  const lower = userScopeText(message, history).toLowerCase();
  if (!/\b(change|changes|stage|commit|push|review|diff|working tree|workspace)\b/.test(lower)) return "";

  const executed = new Set(toolCallsMade.filter((call) => call.ok).map((call) => call.name));
  const hasStatus = executed.has("git_status");
  const hasDiff = executed.has("git_diff") || executed.has("git_show");

  if (toolName === "git_add" && (!hasStatus || !hasDiff)) {
    const hasPaths = Array.isArray(args["paths"]) && args["paths"].length > 0;
    return hasPaths
      ? "Inspect current changes with git_status and git_diff before requesting approval to stage selected paths."
      : "Inspect current changes with git_status and git_diff, then propose git_add with exact paths or explain why all changed paths should be staged.";
  }

  if (toolName === "git_commit" && !executed.has("git_add") && !historyMentionsExecuted(history, "git_add")) {
    return "Verify staged content with git_status and git_diff staged=true before requesting approval to commit.";
  }

  if (toolName === "git_push" && !executed.has("git_commit") && !historyMentionsExecuted(history, "git_commit")) {
    return "Do not push until the requested commit has been created; inspect current branch/status and propose the commit step first.";
  }

  return "";
}

export function outOfScopeWriteMessage(
  toolName: string,
  message: string,
  history: ChatMessage[],
): string {
  const scope = userScopeText(message, history).toLowerCase();
  if (toolName === "ado_create_pr" && !/\b(pr|pull request)\b/.test(scope)) {
    return "The requested workflow scope does not include creating a pull request. I will stop at the requested Git workflow boundary unless you explicitly ask me to create a PR.";
  }
  if (/work_item|workitem/.test(toolName) && !/\b(work item|workitem|user story|task|bug|link)\b/.test(scope)) {
    return "The requested workflow scope does not include linking work items, and no work item was explicitly selected. I will not link a work item unless you ask for it and provide or select the work item.";
  }
  if (toolName === "ado_trigger_pipeline" && !/\b(pipeline|build|run ci|trigger)\b/.test(scope)) {
    return "The requested workflow scope does not include triggering a pipeline. I will not run the pipeline unless you explicitly ask for it.";
  }
  return "";
}

function userScopeText(message: string, history: ChatMessage[]): string {
  const userHistory = history
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content)
    .join("\n");
  return `${userHistory}\n${message}`;
}

function historyMentionsExecuted(history: ChatMessage[], toolName: string): boolean {
  const marker = `[executed] ${toolName}`;
  const confirmedMarker = `[confirmed & executed] ${toolName}`;
  return history.some((entry) =>
    entry.role === "assistant" &&
    (entry.content.includes(marker) || entry.content.includes(confirmedMarker))
  );
}
