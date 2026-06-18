import { useMemo } from "react";
import type {
  ChatIndexStatus,
  ProjectLink,
} from "../../api.js";
import { groupChatRenderItems } from "../../chatRenderItems.js";
import {
  deriveComposerInputState,
  deriveComposerStateNotice,
  deriveSuggestionReplies,
  type ComposerInputState,
  type ComposerStateNotice,
  type SuggestionReply,
} from "../../components/conversation/SuggestionReplyBar.js";
import type { ChatRenderItem } from "../../chatRenderItems.js";
import type { DiffStats } from "./layout/workspacePanel.types.js";
import { parseGitDiff, parseGitStatus, type GitStatusData } from "./toolOutputRenderers.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import { taskStateFromWorkflow, type TaskState } from "./workflowTaskState.js";

export type ComposerPendingApproval = ApprovalRequest | Bubble | null;

export interface ChatDerivedState {
  currentBranch: string | null;
  gitStatus: GitStatusData | null;
  renderItems: ChatRenderItem<Bubble>[];
  suggestionReplies: SuggestionReply[];
  composerPendingApproval: ComposerPendingApproval;
  composerStateNotice: ComposerStateNotice | null;
  composerInputState: ComposerInputState;
  conversationTitle: string | null;
  branchList: string[];
  diffStats: DiffStats | null;
  welcomeSuggestions: string[];
  taskState: TaskState | null;
}

export function currentBranchFromBubbles(bubbles: Bubble[]): string | null {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i]!;
    if (bubble.kind !== "tool" || !bubble.toolOk || !bubble.toolResult || typeof bubble.toolResult !== "object") {
      continue;
    }
    const result = bubble.toolResult as Record<string, unknown>;
    if (bubble.toolName === "git_current_branch") {
      return String(result["branch"] ?? String(result["stdout"] ?? "").trim().split("\n")[0]).trim().slice(0, 45);
    }
    if (bubble.toolName === "git_status") {
      const match = String(result["stdout"] ?? "").match(/^## ([^\s.]+)/m);
      if (match?.[1]) return match[1].slice(0, 45);
    }
  }
  return null;
}

export function gitStatusFromBubbles(bubbles: Bubble[]): GitStatusData | null {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i]!;
    if (bubble.kind === "tool" && bubble.toolOk && bubble.toolName === "git_status" && bubble.toolResult) {
      const stdout = String((bubble.toolResult as Record<string, unknown>)["stdout"] ?? "");
      return parseGitStatus(stdout);
    }
  }
  return null;
}

export function conversationTitleFromBubbles(bubbles: Bubble[]): string | null {
  const first = bubbles.find((bubble) => bubble.kind === "user");
  if (!first?.text) return null;
  const text = first.text.trim();
  return text.length > 55 ? `${text.slice(0, 55)}…` : text;
}

export function branchListFromBubbles(bubbles: Bubble[]): string[] {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i]!;
    if (bubble.kind === "tool" && bubble.toolOk && bubble.toolName === "git_branch_list" && bubble.toolResult) {
      const stdout = String((bubble.toolResult as Record<string, unknown>)["stdout"] ?? "");
      return stdout.split("\n").filter(Boolean).map((line) => line.replace(/^\*\s*/, "").trim()).filter(Boolean);
    }
  }
  return [];
}

export function diffStatsFromBubbles(bubbles: Bubble[]): DiffStats | null {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i]!;
    if (bubble.kind === "tool" && bubble.toolOk && bubble.toolName === "git_diff" && bubble.toolResult) {
      const stdout = String((bubble.toolResult as Record<string, unknown>)["stdout"] ?? "");
      const files = parseGitDiff(stdout);
      if (files.length === 0) return { files: 0, added: 0, removed: 0 };
      return {
        files: files.length,
        added: files.reduce((sum, file) => sum + file.added, 0),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
      };
    }
  }
  return null;
}

export function pendingApprovalFromBubbles(
  bubbles: Bubble[],
  workflowState: WorkflowEventState | null,
): ComposerPendingApproval {
  return (
    workflowState?.pendingApproval
    ?? [...bubbles].reverse().find((bubble) => bubble.kind === "pending_confirm" && bubble.pendingStatus === "waiting")
    ?? null
  );
}

export function welcomeSuggestionsForProjectLink(
  activeProjectLink: ProjectLink | null,
  indexStatus: ChatIndexStatus | null,
): string[] {
  const hasAdoMapping = Boolean(activeProjectLink?.adoOrgUrl && activeProjectLink.adoProject && activeProjectLink.adoRepoName);
  const hasPipeline = Boolean(activeProjectLink?.adoPipelineId || activeProjectLink?.adoPipelineName);
  const needsProjectUnderstanding = indexStatus ? (!indexStatus.indexed || !indexStatus.semanticReady) : false;
  const suggestions = [
    needsProjectUnderstanding ? "Understand this project" : "Explain this project architecture",
    "Review my changes",
    "What's on this branch?",
    hasAdoMapping ? "Analyze PR insight for this repo" : "Run tests",
    hasPipeline ? "Check the CI/CD pipeline state" : "Find the build and test commands",
    "Stage and commit",
    hasAdoMapping ? "Push and create PR" : "Prepare a PR plan",
  ];
  return Array.from(new Set(suggestions)).slice(0, 7);
}

export function useChatDerivedState({
  activeProjectLink,
  bubbles,
  busy,
  indexStatus,
  input,
  queuedSuggestionLabel,
  statusText,
  workflowState,
}: {
  activeProjectLink: ProjectLink | null;
  bubbles: Bubble[];
  busy: boolean;
  indexStatus: ChatIndexStatus | null;
  input: string;
  queuedSuggestionLabel?: string;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
}): ChatDerivedState {
  return useMemo(() => {
    const lastAssistant = [...bubbles].reverse().find((bubble) => bubble.kind === "assistant");
    const lastUser = [...bubbles].reverse().find((bubble) => bubble.kind === "user");
    const lastError = [...bubbles].reverse().find((bubble) => bubble.kind === "error");
    const composerPendingApproval = pendingApprovalFromBubbles(bubbles, workflowState);
    const pendingTool =
      workflowState?.pendingApproval?.action.tool ??
      [...bubbles].reverse().find((bubble) => bubble.kind === "pending_confirm" && bubble.pendingStatus === "waiting")?.pendingTool;
    const sourceTypes = Array.from(new Set((lastAssistant?.meta?.sources ?? []).map((source) => source.type)));
    const conversationTitle = conversationTitleFromBubbles(bubbles);

    return {
      currentBranch: currentBranchFromBubbles(bubbles),
      gitStatus: gitStatusFromBubbles(bubbles),
      renderItems: groupChatRenderItems(bubbles),
      suggestionReplies: deriveSuggestionReplies({
        metadataSuggestions: lastAssistant?.meta?.suggestions,
        metadataActions: lastAssistant?.meta?.actionsTaken,
        sourceTypes,
        lastAssistantText: lastAssistant?.text,
        lastUserText: lastUser?.text,
        workflowStatus: workflowState?.status,
        workflowKind: workflowState?.workflowKind,
        workflowPhase: workflowState?.workflowPhase,
        pendingTool,
        pendingApprovalTool: workflowState?.pendingApproval?.action.tool,
        pendingApprovalDescription: workflowState?.pendingApproval?.action.description,
        hasAuthError: Boolean(lastError?.text && /\b(auth|oauth|pat|token|credential|sign in|permission)\b/i.test(lastError.text)),
        inputValue: input,
        busy,
      }),
      composerPendingApproval,
      composerStateNotice: deriveComposerStateNotice({
        busy,
        workflowStatus: workflowState?.status,
        pendingApproval: Boolean(composerPendingApproval),
        pendingApprovalDescription:
          composerPendingApproval && "action" in composerPendingApproval
            ? composerPendingApproval.action.description
            : composerPendingApproval?.pendingDescription,
        queuedLabel: queuedSuggestionLabel,
        statusText,
      }),
      composerInputState: deriveComposerInputState({
        busy,
        workflowStatus: workflowState?.status,
        pendingApproval: Boolean(composerPendingApproval),
        inputValue: input,
      }),
      conversationTitle,
      branchList: branchListFromBubbles(bubbles),
      diffStats: diffStatsFromBubbles(bubbles),
      welcomeSuggestions: welcomeSuggestionsForProjectLink(activeProjectLink, indexStatus),
      taskState: taskStateFromWorkflow(workflowState, conversationTitle),
    };
  }, [activeProjectLink, bubbles, busy, indexStatus, input, queuedSuggestionLabel, statusText, workflowState]);
}
