import type { PendingToolAction } from "@mergepilot/core";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import { dirtyWorkingTreeSummary } from "./gitOperation.js";
import type { GitWorkflowProbeResult } from "./gitProbes.js";
import { normalizeBranchName } from "./workspaceBranchPreflight.js";

export type PrPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "pr" }>;

export function prPreflightFromPayload(
  payload: ChatWorkflowActionPayload,
  currentBranch: string,
  statusText: string,
  latestSubject: string,
): PrPreflight {
  const projectLink = payload.projectLink;
  const organization = String(projectLink?.adoOrgUrl ?? "").trim();
  const project = String(projectLink?.adoProject ?? "").trim();
  const repository = String(projectLink?.adoRepoName ?? "").trim();
  const sourceBranch = normalizeBranchName(String(payload.branch ?? currentBranch ?? "").trim());
  const targetBranch = normalizeBranchName(String(payload.targetBranch ?? projectLink?.targetBranch ?? projectLink?.defaultBranch ?? "main").trim()) || "main";
  const explicitTitle = String(payload.title ?? payload.message ?? "").trim();
  const title = explicitTitle || latestSubject || `Update from ${sourceBranch || "current branch"}`;
  const missing = [
    !organization ? "Azure DevOps organization URL" : "",
    !project ? "ADO project" : "",
    !repository ? "ADO repository" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      kind: "pr",
      status: "missing_ado_mapping",
      sourceBranch: sourceBranch || undefined,
      targetBranch,
      repository: repository || undefined,
      project: project || undefined,
      organization: organization || undefined,
      title,
      summary: `Project Link is missing ${missing.join(", ")} before a pull request can be created.`,
    };
  }
  if (!sourceBranch) {
    return {
      kind: "pr",
      status: "missing_source_branch",
      targetBranch,
      repository,
      project,
      organization,
      title,
      summary: "Current source branch could not be detected before creating a pull request.",
    };
  }
  const dirtySummary = dirtyWorkingTreeSummary(statusText);
  if (dirtySummary) {
    return {
      kind: "pr",
      status: "dirty_worktree",
      sourceBranch,
      targetBranch,
      repository,
      project,
      organization,
      title,
      summary: `${dirtySummary} Uncommitted changes will not be included in the pull request until committed and pushed.`,
    };
  }
  return {
    kind: "pr",
    status: "ready",
    sourceBranch,
    targetBranch,
    repository,
    project,
    organization,
    title,
    summary: `Ready to create PR ${sourceBranch} -> ${targetBranch} in ${project}/${repository}.`,
  };
}

export function prPreflightFromTools(args: {
  payload: ChatWorkflowActionPayload;
  tools: GitWorkflowProbeResult["tools"];
  statusText: string;
}): PrPreflight {
  const currentBranch = args.tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() ?? "";
  const latestSubject = args.tools.find((tool) => tool.name === "git_log_subject" && tool.ok)?.stdout.trim() ?? "";
  return prPreflightFromPayload(args.payload, currentBranch, args.statusText, latestSubject);
}
