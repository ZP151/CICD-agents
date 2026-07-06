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
  if (action === "fetch_remotes") {
    return {
      tool: "git_fetch",
      args: { remote: "origin", prune: true },
      description: "Fetch latest remote refs from origin and prune deleted remote-tracking branches.",
      nextHint: "refresh branch status",
      workflow: {
        kind: "git",
        phase: "fetch_remotes",
        branch: branch || undefined,
      },
    };
  }
  if (action === "sync_branch_rebase") {
    if (!branch) throw new Error("Current branch is required before syncing.");
    const readinessSummary = pushReadiness?.summary ? ` ${pushReadiness.summary}` : "";
    return {
      tool: "git_pull",
      args: { remote: "origin", branch, rebase: true },
      description: `Pull latest changes from origin/${branch} with rebase before pushing.${readinessSummary}`,
      nextHint: "inspect branch status",
      readiness: pushReadiness,
      workflow: {
        kind: "git",
        phase: "sync_branch",
        branch,
      },
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
  if (action === "sync_branch_rebase") return "high";
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
  pushReadiness?: PendingToolAction["readiness"];
  latestCommitSubject?: string;
  latestCommitStat?: string;
}): string {
  const lines: string[] = [];
  if (action === "draft_commit_message") {
    lines.push(`Suggested commit message: \`${draftCommitMessageFromChangedFiles(args.changedFiles)}\``);
    if (args.changedFiles.length > 0) {
      lines.push(`Basis: ${args.changedFiles.length} changed file(s).`);
    }
  }
  if (action === "explain_change_scope") {
    lines.push(...changeScopeSummaryLines(args.changedFiles));
  }
  if (action === "inspect_remote_target") {
    lines.push(...remoteTargetSummaryLines(args.currentBranch, args.pushReadiness));
  }
  if (action === "inspect_latest_commit") {
    lines.push(...latestCommitSummaryLines(args.latestCommitSubject ?? "", args.latestCommitStat ?? "", args.pushReadiness));
  }
  if (args.currentBranch) lines.push(`Branch: ${args.currentBranch}`);
  if (args.operationState && args.operationState.status !== "normal") lines.push(args.operationState.summary);
  if (args.statusText) {
    const statusLines = args.statusText.split(/\r?\n/).filter(Boolean);
    lines.push(`Git status: ${statusLines.length} line(s)`);
  } else if (action !== "refresh_branch") {
    lines.push("Git status: clean");
  }
  if (args.changedFiles.length > 0) lines.push(`Changed files: ${args.changedFiles.slice(0, 12).join(", ")}${args.changedFiles.length > 12 ? ", ..." : ""}`);
  if (action === "inspect_changes") lines.push(...changeReviewRiskLines(args.changedFiles));
  if (args.diffStat) lines.push(args.diffStat);
  if (action === "run_tests") lines.push("Validation: waiting to run tests after approval.");
  if (action === "run_build") lines.push("Validation: waiting to run build after approval.");
  return lines.join("\n") || "Workspace state refreshed.";
}

export function draftCommitMessageFromChangedFiles(files: string[]): string {
  const normalized = files.map((file) => file.replace(/\\/g, "/")).filter(Boolean);
  if (normalized.length === 0) return "chore: refresh workspace state";
  const scope = commitScopeFromFiles(normalized);
  const type = commitTypeFromFiles(normalized);
  const subject = commitSubjectFromFiles(normalized, scope, type);
  return scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
}

function commitTypeFromFiles(files: string[]): string {
  if (files.every((file) => /\.(md|mdx|txt|adoc)$/i.test(file) || file.startsWith("docs/"))) return "docs";
  if (files.every((file) => /\b(test|spec)\.[a-z0-9]+$/i.test(file) || file.includes("__tests__/"))) return "test";
  if (files.some((file) => file.startsWith(".github/") || file.includes("/workflows/"))) return "ci";
  if (files.some((file) => /(^|\/)(package.json|pnpm-lock.yaml|tsconfig[^/]*\.json|vite\.config\.)/i.test(file))) return "chore";
  return "chore";
}

function commitScopeFromFiles(files: string[]): string {
  const first = files[0] ?? "";
  if (files.every((file) => file.startsWith("apps/desktop/"))) return "desktop";
  if (files.every((file) => file.startsWith("packages/daemon/"))) return "daemon";
  if (files.every((file) => file.startsWith("packages/core/"))) return "core";
  if (files.every((file) => file.startsWith("docs/"))) return "docs";
  if (files.every((file) => file.startsWith(".github/"))) return "ci";
  const match = first.match(/^(apps|packages)\/([^/]+)/);
  return match?.[2] ?? "";
}

function commitSubjectFromFiles(files: string[], scope: string, type: string): string {
  if (type === "docs") return "update documentation";
  if (type === "test") return "update tests";
  if (type === "ci") return "update ci workflow";
  if (scope === "desktop") return "update desktop workflow";
  if (scope === "daemon") return "update daemon workflow";
  if (scope === "core") return "update core workflow";
  if (scope === "docs") return "update documentation";
  return files.length === 1 ? `update ${basenameWithoutExtension(files[0] ?? "workspace")}` : "update workspace changes";
}

function basenameWithoutExtension(file: string): string {
  const basename = file.split("/").pop() || "workspace";
  return basename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function changeScopeSummaryLines(files: string[]): string[] {
  if (files.length === 0) return ["Change scope: no changed files detected."];
  const groups = new Map<string, string[]>();
  for (const file of files.map((item) => item.replace(/\\/g, "/")).filter(Boolean)) {
    const scope = changeScopeForFile(file);
    groups.set(scope, [...(groups.get(scope) ?? []), file]);
  }
  const lines = [`Change scope: ${groups.size} area(s), ${files.length} file(s).`];
  for (const [scope, scopedFiles] of groups) {
    const preview = scopedFiles.slice(0, 5).join(", ");
    lines.push(`- ${scope}: ${preview}${scopedFiles.length > 5 ? ", ..." : ""}`);
  }
  return lines;
}

function changeReviewRiskLines(files: string[]): string[] {
  const normalized = files.map((file) => file.replace(/\\/g, "/")).filter(Boolean);
  const sensitiveConfigFiles = normalized.filter((file) =>
    /(^|\/)(\.env[^/]*|appsettings[^/]*\.json|web\.config|.*config\.(json|ya?ml|toml|xml)|.*secret.*|.*credential.*|.*key.*)$/i.test(file) ||
    /(^|\/)(config|settings|secrets?)\//i.test(file)
  );
  if (sensitiveConfigFiles.length === 0) return [];
  const preview = sensitiveConfigFiles.slice(0, 5).join(", ");
  return [
    `Security/config risk: ${preview}${sensitiveConfigFiles.length > 5 ? ", ..." : ""} may contain secret, credential, API key, token, or environment configuration changes. Review the detailed diff before committing.`,
  ];
}

function changeScopeForFile(file: string): string {
  if (file.startsWith("apps/desktop/")) return "desktop app";
  if (file.startsWith("packages/daemon/")) return "daemon service";
  if (file.startsWith("packages/core/")) return "core agent logic";
  if (file.startsWith("tests/e2e/")) return "end-to-end tests";
  if (file.startsWith("docs/") || /\.(md|mdx|txt|adoc)$/i.test(file)) return "documentation";
  if (file.startsWith(".github/")) return "ci workflow";
  if (file.includes("/test/") || /\b(test|spec)\.[a-z0-9]+$/i.test(file)) return "tests";
  return file.split("/")[0] || "workspace";
}

function remoteTargetSummaryLines(
  currentBranch: string,
  readiness?: PendingToolAction["readiness"],
): string[] {
  const branch = currentBranch || "current branch";
  if (readiness?.kind !== "push") {
    return [`Remote target: ${branch} has no readable upstream target.`];
  }
  if (readiness.status === "no_upstream") {
    return [
      `Remote target: origin/${branch}`,
      "Upstream: not configured; push will set upstream on origin.",
    ];
  }
  const upstream = readiness.upstream || `origin/${branch}`;
  const lines = [
    `Remote target: ${upstream}`,
    `Readiness: ${readiness.summary}`,
  ];
  if (typeof readiness.ahead === "number" || typeof readiness.behind === "number") {
    lines.push(`Divergence: ahead ${readiness.ahead ?? 0}, behind ${readiness.behind ?? 0}.`);
  }
  return lines;
}

function latestCommitSummaryLines(
  subject: string,
  stat: string,
  readiness?: PendingToolAction["readiness"],
): string[] {
  const lines = subject ? [`Latest commit: ${subject}`] : ["Latest commit: unavailable."];
  if (readiness?.kind === "push") {
    lines.push(`Remote status: ${readiness.summary}`);
  }
  const statLines = stat.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const fileLines = statLines.filter((line) => /\|\s+\d+/.test(line));
  const summaryLine = statLines.find((line) => /\bfiles? changed\b/.test(line));
  if (fileLines.length > 0) {
    lines.push(`Commit files: ${fileLines.slice(0, 8).join("; ")}${fileLines.length > 8 ? "; ..." : ""}`);
  }
  if (summaryLine) lines.push(`Commit stat: ${summaryLine.trim()}`);
  return lines;
}
