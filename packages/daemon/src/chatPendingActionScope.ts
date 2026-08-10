import {
  type ChatMessage,
} from "@mergepilot/core";
import type { StoredBubble } from "./chatHistoryStore.js";

export function isProposalWithinUserScope(
  tool: string,
  bubbles: StoredBubble[],
  args: Record<string, unknown> = {},
): boolean {
  if (isGitWriteBlockedByConflict(tool, args, bubbles)) return false;
  if (tool === "git_merge" && !hasStringArg(args, "ref")) return false;
  if (tool === "git_rebase" && !hasStringArg(args, "onto") && !hasStringArg(args, "action")) return false;
  if (tool === "ado_create_pr" && !hasStringArg(args, "target_branch")) return false;
  if (tool === "git_push" || tool === "git_push_tag") return userScopeAllowsGitStep(bubbles, "push");
  if (tool === "git_pull") return userScopeAllowsGitStep(bubbles, "pull") || hasInScopeFailedPush(bubbles);
  if (tool === "git_rebase") return userScopeAllowsGitStep(bubbles, "rebase") || hasInScopeFailedPush(bubbles);
  if (tool === "ado_create_pr") return userScopeAllowsAdoStep(bubbles, "pr");
  if (/work_item|workitem/.test(tool)) return userScopeAllowsAdoStep(bubbles, "work_item");
  if (tool === "ado_trigger_pipeline") return userScopeAllowsAdoStep(bubbles, "pipeline");
  return true;
}

function hasStringArg(args: Record<string, unknown>, key: string): boolean {
  return typeof args[key] === "string" && args[key].trim().length > 0;
}

export function isToolWithinChatMessageScope(tool: string, messages: ChatMessage[]): boolean {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();
  if (tool === "git_push" || tool === "git_push_tag") return /\b(push|publish|remote|pr|pull request)\b/.test(userText);
  if (tool === "git_pull") return /\b(pull|sync|latest|update|behind|rebase|push|publish|remote)\b/.test(userText);
  if (tool === "git_rebase") return /\b(rebase|sync|latest|update|behind|push|publish|remote)\b/.test(userText);
  if (!["ado_create_pr", "ado_trigger_pipeline"].includes(tool) && !/work_item|workitem/.test(tool)) return true;
  if (tool === "ado_create_pr") return /\b(pr|pull request)\b/.test(userText);
  if (/work_item|workitem/.test(tool)) return /\b(work item|workitem|user story|task|bug|link)\b/.test(userText);
  return /\b(pipeline|build|run ci|trigger)\b/.test(userText);
}

function isGitWriteBlockedByConflict(tool: string, args: Record<string, unknown>, bubbles: StoredBubble[]): boolean {
  if (!tool.startsWith("git_")) return false;
  if (!hasUnresolvedGitOperationHistory(bubbles)) return false;
  if (tool === "git_rebase" && ["continue", "abort", "skip"].includes(String(args["action"] ?? ""))) return false;
  if (tool === "git_add") return Array.isArray(args["paths"]) ? args["paths"].length === 0 : true;
  if (tool === "git_restore") return Array.isArray(args["paths"]) ? args["paths"].length === 0 : true;
  return true;
}

function hasUnresolvedGitOperationHistory(bubbles: StoredBubble[]): boolean {
  for (const bubble of [...bubbles].reverse()) {
    if (bubble.toolName === "git_rebase" && bubble.toolOk && isRebaseResolutionAction(bubble.toolArgs)) return false;
    if (bubble.toolName === "git_merge" && bubble.toolOk) return false;
    if (isConflictToolBubble(bubble)) return true;
  }
  return false;
}

function isRebaseResolutionAction(args: Record<string, unknown> | undefined): boolean {
  return ["continue", "abort", "skip"].includes(String(args?.["action"] ?? ""));
}

function isConflictToolBubble(bubble: StoredBubble): boolean {
  if (!["git_rebase", "git_pull", "git_merge"].includes(String(bubble.toolName ?? ""))) return false;
  if (bubble.toolOk !== false) return false;
  const text = [
    bubble.content,
    bubble.toolSummary,
    typeof bubble.toolResult === "string" ? bubble.toolResult : JSON.stringify(bubble.toolResult ?? {}),
  ].join("\n").toLowerCase();
  return /\bconflict\b|unmerged|rebase-merge|merge_head|resolve all conflicts/.test(text);
}

function userScopeAllowsAdoStep(
  bubbles: StoredBubble[],
  step: "pr" | "work_item" | "pipeline",
): boolean {
  const userText = bubbles
    .filter((bubble) => bubble.role === "user")
    .map((bubble) => bubble.content)
    .join("\n")
    .toLowerCase();
  if (step === "pr") return /\b(pr|pull request)\b/.test(userText);
  if (step === "work_item") return /\b(work item|workitem|user story|task|bug|link)\b/.test(userText);
  return /\b(pipeline|build|run ci|trigger)\b/.test(userText);
}

function userScopeAllowsGitStep(
  bubbles: StoredBubble[],
  step: "push" | "pull" | "rebase",
): boolean {
  const userText = bubbles
    .filter((bubble) => bubble.role === "user")
    .map((bubble) => bubble.content)
    .join("\n")
    .toLowerCase();
  if (step === "push") return /\b(push|publish|remote|pr|pull request)\b/.test(userText);
  if (step === "pull") return /\b(pull|sync|latest|update|behind|rebase|push|publish|remote)\b/.test(userText);
  return /\b(rebase|sync|latest|update|behind|push|publish|remote)\b/.test(userText);
}

function hasInScopeFailedPush(bubbles: StoredBubble[]): boolean {
  return userScopeAllowsGitStep(bubbles, "push") &&
    bubbles.some((bubble) => bubble.toolName === "git_push" && bubble.toolOk === false);
}
