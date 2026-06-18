import type { PendingToolAction } from "@mergepilot/core";
import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  branchPreflightFromTools,
} from "./workspaceBranchPreflight.js";
import {
  dirtyWorkingTreeSummary,
  type GitOperationState,
} from "./gitOperation.js";
import type { GitWorkflowProbeResult } from "./gitProbes.js";
import {
  buildGitRecoveryProposal,
  buildStageResolvedConflictsProposal,
  isGitRecoveryWorkflowAction,
  type GitRecoveryWorkflowAction,
} from "./workspaceRecoveryActions.js";
import {
  prPreflightFromPayload,
  prPreflightFromTools,
  type PrPreflight,
} from "./workspacePrPreflight.js";
import { pushReadinessFromTools } from "./workspacePushReadiness.js";
import {
  changedFilesFromGitOutputs,
  focusedValidationPreflightFromSession,
  validationPreflightFromPayload,
  type ValidationPreflight,
} from "./validationPreflight.js";

export type { GitRecoveryWorkflowAction } from "./workspaceRecoveryActions.js";
export type { PrPreflight } from "./workspacePrPreflight.js";
export { isGitRecoveryWorkflowAction } from "./workspaceRecoveryActions.js";
export { pushReadinessFromTools } from "./workspacePushReadiness.js";

export function buildWorkspaceWorkflowProposal(
  action: ChatWorkflowActionPayload["action"],
  payload: ChatWorkflowActionPayload,
  currentBranch: string,
  statusText: string,
  pushReadiness?: PendingToolAction["readiness"],
  preflight?: PendingToolAction["preflight"],
  operationState?: GitOperationState,
): PendingToolAction | undefined {
  const branch = String(payload.branch ?? currentBranch ?? "").trim();
  const dirtySummary = dirtyWorkingTreeSummary(statusText);
  const dirtySuffix = dirtySummary ? ` ${dirtySummary}` : "";
  if (isGitRecoveryWorkflowAction(action)) {
    return buildGitRecoveryProposal({ action, branch, operationState });
  }
  if (action === "stage_resolved_conflicts") {
    return buildStageResolvedConflictsProposal({ payload, branch, operationState });
  }
  if (action === "checkout_branch") {
    if (!branch) throw new Error("Branch is required to switch branches.");
    const branchPreflight = preflight?.kind === "branch" ? preflight : undefined;
    if (branchPreflight?.status === "current" || branchPreflight?.status === "missing" || branchPreflight?.status === "invalid") {
      return undefined;
    }
    if (branchPreflight?.status === "remote_only" && branchPreflight.remoteBranch) {
      return {
        tool: "git_switch",
        args: { branch: branchPreflight.branch, create: true, startPoint: branchPreflight.remoteBranch, track: true },
        description: `${branchPreflight.summary}${dirtySuffix ? ` ${dirtySuffix}` : ""}`,
        nextHint: "inspect branch status",
        preflight: branchPreflight,
      };
    }
    return {
      tool: "git_checkout",
      args: { ref: branch },
      description: `${branchPreflight?.summary ?? `Switch to branch ${branch}.`}${dirtySuffix ? ` ${dirtySuffix}` : ""}`,
      nextHint: "inspect branch status",
      preflight: branchPreflight,
    };
  }
  if (action === "create_branch") {
    if (!branch) throw new Error("Branch name is required to create a branch.");
    const branchPreflight = preflight?.kind === "branch" ? preflight : undefined;
    if (branchPreflight?.status === "already_exists" || branchPreflight?.status === "invalid") {
      return undefined;
    }
    return {
      tool: "git_create_branch",
      args: { name: branch },
      description: `${branchPreflight?.summary ?? `Create and switch to branch ${branch}.`}${dirtySuffix ? ` ${dirtySuffix}` : ""}`,
      nextHint: "inspect branch status",
      preflight: branchPreflight,
    };
  }
  if (action === "push_branch") {
    if (!branch) throw new Error("Current branch is required before pushing.");
    const readinessSummary = pushReadiness?.summary ? ` ${pushReadiness.summary}` : "";
    return {
      tool: "git_push",
      args: { branch, setUpstream: true },
      description: `Push branch ${branch} to origin.${readinessSummary}`,
      nextHint: "report push result",
      readiness: pushReadiness,
    };
  }
  if (action === "create_pr") {
    const prPreflight = preflight?.kind === "pr" ? preflight : prPreflightFromPayload(payload, currentBranch, statusText, "");
    if (prPreflight.status !== "ready" && prPreflight.status !== "dirty_worktree") {
      throw new Error(prPreflight.summary);
    }
    const sourceBranch = prPreflight.sourceBranch;
    const targetBranch = prPreflight.targetBranch ?? "main";
    const title = prPreflight.title || `Update from ${sourceBranch}`;
    if (!sourceBranch) throw new Error("Current branch is required before creating a pull request.");
    const dirtyPrSuffix = prPreflight.status === "dirty_worktree" ? ` ${prPreflight.summary}` : "";
    return {
      tool: "ado_create_pr",
      args: {
        organization: prPreflight.organization,
        project: prPreflight.project,
        repository: prPreflight.repository,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description: String(payload.description ?? "").trim(),
        draft: Boolean(payload.draft),
      },
      description: `Create pull request ${sourceBranch} -> ${targetBranch}: ${title}.${dirtyPrSuffix}`,
      nextHint: "inspect PR insight after creation",
      preflight: prPreflight,
      workflow: {
        kind: "pr",
        phase: "create",
        branch: sourceBranch,
        message: title,
      },
    };
  }
  if (action === "run_tests" || action === "run_build") {
    const kind = action === "run_build" ? "build" : "test";
    const validationPreflight: ValidationPreflight = preflight?.kind === "validation"
      ? preflight
      : validationPreflightFromPayload(payload, kind, []);
    return {
      tool: "validation_command",
      args: { command: validationPreflight.command, kind },
      description: `Run ${kind} validation: ${validationPreflight.command}`,
      nextHint: kind === "build" ? "report build result" : "report test result",
      preflight: validationPreflight,
      workflow: {
        kind: "ci",
        phase: kind,
        branch: branch || undefined,
        message: validationPreflight.command,
      },
    };
  }
  if (action === "prepare_commit") {
    const message = String(payload.message ?? "").trim();
    const shouldPush = payload.commitMode === "commit-push";
    if (payload.includeUnstaged) {
      return {
        tool: "git_add",
        args: { all: true },
        description: "Stage all current changes for commit.",
        nextHint: message
          ? `commit staged changes with message: ${message}${shouldPush ? ", then push the branch" : ""}`
          : `generate a concise commit message and commit staged changes${shouldPush ? ", then push the branch" : ""}`,
        workflow: {
          kind: "commit",
          phase: "stage",
          branch: branch || undefined,
          message: message || undefined,
          pushAfterCommit: shouldPush,
        },
      };
    }
    if (!message) {
      throw new Error("A commit message is required when committing staged changes only.");
    }
    return {
      tool: "git_commit",
      args: { message },
      description: `Commit staged changes with message: ${message}`,
      nextHint: shouldPush ? "push the branch" : "done",
      workflow: {
        kind: "commit",
        phase: "commit",
        branch: branch || undefined,
        message,
        pushAfterCommit: shouldPush,
      },
    };
  }
  return undefined;
}

export async function preflightFromTools(
  chatSessions: ChatSessionManager,
  action: ChatWorkflowActionPayload["action"],
  payload: ChatWorkflowActionPayload,
  tools: GitWorkflowProbeResult["tools"],
  statusText: string,
): Promise<PendingToolAction["preflight"] | undefined> {
  if (action === "checkout_branch" || action === "create_branch") return branchPreflightFromTools(action, payload, tools);
  if (action === "create_pr") {
    return prPreflightFromTools({ payload, tools, statusText });
  }
  if (action === "run_tests" || action === "run_build") {
    const statusText = tools.find((tool) => tool.name === "git_status")?.stdout.trim() || "";
    const changedFiles = changedFilesFromGitOutputs(
      tools.find((tool) => tool.name === "git_diff_name_only")?.stdout ?? "",
      statusText,
    );
    const kind = action === "run_build" ? "build" : "test";
    return await focusedValidationPreflightFromSession(chatSessions, payload, kind, changedFiles)
      ?? validationPreflightFromPayload(payload, kind, changedFiles);
  }
  return undefined;
}

export function workflowRiskForAction(
  action: ChatWorkflowActionPayload["action"],
  statusText: string,
  preflight?: PendingToolAction["preflight"],
): string {
  if (action === "push_branch") return "high";
  if (action === "create_pr") return "high";
  if (isGitRecoveryWorkflowAction(action)) return "high";
  if (action === "stage_resolved_conflicts") return "high";
  if (action === "run_tests" || action === "run_build") return "medium";
  if ((action === "checkout_branch" || action === "create_branch") && dirtyWorkingTreeSummary(statusText)) return "high";
  if (preflight?.status === "remote_only") return "medium";
  return "medium";
}

export function summarizeWorkspaceWorkflow(action: string, args: {
  currentBranch: string;
  statusText: string;
  diffStat: string;
  changedFiles: string[];
  operationState?: GitOperationState;
}): string {
  const lines: string[] = [];
  if (args.currentBranch) lines.push(`Branch: ${args.currentBranch}`);
  if (args.operationState && args.operationState.status !== "normal") lines.push(args.operationState.summary);
  if (args.statusText) {
    const statusLines = args.statusText.split(/\r?\n/).filter(Boolean);
    lines.push(`Git status: ${statusLines.length} line(s)`);
  } else if (action !== "refresh_branch") {
    lines.push("Git status: clean");
  }
  if (args.changedFiles.length > 0) lines.push(`Changed files: ${args.changedFiles.slice(0, 12).join(", ")}${args.changedFiles.length > 12 ? ", ..." : ""}`);
  if (args.diffStat) lines.push(args.diffStat);
  if (action === "run_tests") lines.push("Validation: waiting to run tests after approval.");
  if (action === "run_build") lines.push("Validation: waiting to run build after approval.");
  return lines.join("\n") || "Workspace state refreshed.";
}
