import type { PendingToolAction } from "@mergepilot/core";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  gitOperationPhaseLabel,
  type GitOperationPhase,
  type GitOperationState,
} from "./gitOperation.js";

export type GitRecoveryWorkflowAction =
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

interface GitRecoverySpec {
  phase: Exclude<GitOperationPhase, "normal">;
  tool: "git_rebase" | "git_merge" | "git_cherry_pick" | "git_revert";
  gitAction: "continue" | "abort" | "skip";
  label: string;
}

const GIT_RECOVERY_ACTIONS: Record<GitRecoveryWorkflowAction, GitRecoverySpec> = {
  continue_rebase: { phase: "rebase", tool: "git_rebase", gitAction: "continue", label: "Continue rebase" },
  abort_rebase: { phase: "rebase", tool: "git_rebase", gitAction: "abort", label: "Abort rebase" },
  skip_rebase: { phase: "rebase", tool: "git_rebase", gitAction: "skip", label: "Skip rebase patch" },
  continue_merge: { phase: "merge", tool: "git_merge", gitAction: "continue", label: "Continue merge" },
  abort_merge: { phase: "merge", tool: "git_merge", gitAction: "abort", label: "Abort merge" },
  continue_cherry_pick: { phase: "cherry_pick", tool: "git_cherry_pick", gitAction: "continue", label: "Continue cherry-pick" },
  abort_cherry_pick: { phase: "cherry_pick", tool: "git_cherry_pick", gitAction: "abort", label: "Abort cherry-pick" },
  skip_cherry_pick: { phase: "cherry_pick", tool: "git_cherry_pick", gitAction: "skip", label: "Skip cherry-pick patch" },
  continue_revert: { phase: "revert", tool: "git_revert", gitAction: "continue", label: "Continue revert" },
  abort_revert: { phase: "revert", tool: "git_revert", gitAction: "abort", label: "Abort revert" },
  skip_revert: { phase: "revert", tool: "git_revert", gitAction: "skip", label: "Skip revert patch" },
};

export function isGitRecoveryWorkflowAction(action: string): action is GitRecoveryWorkflowAction {
  return Object.hasOwn(GIT_RECOVERY_ACTIONS, action);
}

export function buildGitRecoveryProposal(args: {
  action: GitRecoveryWorkflowAction;
  branch: string;
  operationState?: GitOperationState;
}): PendingToolAction {
  const recovery = GIT_RECOVERY_ACTIONS[args.action];
  if (!args.operationState || args.operationState.phase !== recovery.phase) {
    throw new Error(`No in-progress ${gitOperationPhaseLabel(recovery.phase)} was detected for this repository.`);
  }
  const conflictSuffix = args.operationState.status === "conflicted"
    ? ` ${args.operationState.summary}`
    : "";
  return {
    tool: recovery.tool,
    args: { action: recovery.gitAction },
    description: `${recovery.label}.${conflictSuffix}`,
    nextHint: recovery.gitAction === "continue" ? "inspect branch status" : "inspect workspace state",
    workflow: {
      kind: "git",
      phase: args.action,
      branch: args.branch || undefined,
    },
  };
}

export function buildStageResolvedConflictsProposal(args: {
  payload: ChatWorkflowActionPayload;
  branch: string;
  operationState?: GitOperationState;
}): PendingToolAction {
  const operationState = args.operationState;
  if (!operationState || operationState.status !== "conflicted" || operationState.conflictFiles.length === 0) {
    throw new Error("No unresolved conflict files were detected for this repository.");
  }
  const paths = (args.payload.paths ?? []).map((item) => String(item).trim()).filter(Boolean);
  const conflictFiles = new Set(operationState.conflictFiles);
  if (paths.length === 0) throw new Error("At least one conflict file path is required.");
  const outOfScope = paths.filter((item) => !conflictFiles.has(item));
  if (outOfScope.length > 0) {
    throw new Error(`Only current conflict files can be staged in this recovery action: ${outOfScope.join(", ")}`);
  }
  const phaseLabel = gitOperationPhaseLabel(operationState.phase);
  return {
    tool: "git_add",
    args: { paths },
    description: `Stage ${paths.length} resolved conflict file${paths.length === 1 ? "" : "s"} for the in-progress ${phaseLabel}.`,
    nextHint: `continue or abort the in-progress ${phaseLabel}`,
    workflow: {
      kind: "git",
      phase: "stage_conflicts",
      branch: args.branch || undefined,
      message: operationState.phase,
    },
  };
}
