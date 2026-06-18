import type { PendingToolAction } from "@mergepilot/core";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import type { GitWorkflowProbeResult } from "./gitProbes.js";

export type BranchPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "branch" }>;

export function branchPreflightFromTools(
  action: "checkout_branch" | "create_branch",
  payload: ChatWorkflowActionPayload,
  tools: GitWorkflowProbeResult["tools"],
): BranchPreflight | undefined {
  const rawBranch = String(payload.branch ?? "").trim();
  const branch = normalizeBranchName(rawBranch);
  const currentBranch = normalizeBranchName(tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() ?? "");
  if (!branch || branch.includes("..") || branch.startsWith("-")) {
    return {
      kind: "branch",
      action: action === "checkout_branch" ? "checkout" : "create",
      status: "invalid",
      branch: rawBranch,
      currentBranch: currentBranch || undefined,
      summary: rawBranch ? `Branch name ${rawBranch} is not safe to use.` : "Branch name is required.",
    };
  }

  const inventory = parseBranchInventory(tools.find((tool) => tool.name === "git_branch_list" && tool.ok)?.stdout ?? "");
  const localBranch = inventory.local.get(branch);
  const remoteBranch = inventory.remote.get(branch);
  if (action === "checkout_branch") {
    if (currentBranch && branch === currentBranch) {
      return {
        kind: "branch",
        action: "checkout",
        status: "current",
        branch,
        currentBranch,
        localBranch,
        summary: `Already on branch ${branch}.`,
      };
    }
    if (localBranch) {
      return {
        kind: "branch",
        action: "checkout",
        status: "local_exists",
        branch,
        currentBranch: currentBranch || undefined,
        localBranch,
        summary: `Switch to local branch ${branch}.`,
      };
    }
    if (remoteBranch) {
      return {
        kind: "branch",
        action: "checkout",
        status: "remote_only",
        branch,
        currentBranch: currentBranch || undefined,
        remoteBranch,
        summary: `Create local branch ${branch} tracking ${remoteBranch}.`,
      };
    }
    return {
      kind: "branch",
      action: "checkout",
      status: "missing",
      branch,
      currentBranch: currentBranch || undefined,
      summary: `Branch ${branch} was not found locally or in remotes.`,
    };
  }

  if (branch === currentBranch || localBranch || remoteBranch) {
    return {
      kind: "branch",
      action: "create",
      status: "already_exists",
      branch,
      currentBranch: currentBranch || undefined,
      localBranch: localBranch || (branch === currentBranch ? branch : undefined),
      remoteBranch,
      summary: branch === currentBranch
        ? `Already on branch ${branch}; no new branch is needed.`
        : localBranch
        ? `Local branch ${branch} already exists.`
        : `Remote branch ${remoteBranch} already exists; switch to it instead of creating a duplicate branch.`,
    };
  }
  return {
    kind: "branch",
    action: "create",
    status: "would_create",
    branch,
    currentBranch: currentBranch || undefined,
    summary: `Create and switch to new branch ${branch}.`,
  };
}

export function normalizeBranchName(branch: string): string {
  return branch
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "")
    .replace(/^remotes\//, "")
    .replace(/^origin\//, "");
}

function parseBranchInventory(output: string): { local: Map<string, string>; remote: Map<string, string> } {
  const local = new Map<string, string>();
  const remote = new Map<string, string>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/^\*\s*/, "").trim();
    if (!line || line.includes(" -> ")) continue;
    if (line.startsWith("remotes/")) {
      const ref = line.slice("remotes/".length);
      const branch = normalizeBranchName(ref.replace(/^[^/]+\//, ""));
      if (branch) remote.set(branch, ref);
    } else {
      const branch = normalizeBranchName(line);
      if (branch) local.set(branch, branch);
    }
  }
  return { local, remote };
}
