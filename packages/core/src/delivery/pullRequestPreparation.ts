import type { AzureBranchPolicyConfiguration } from "../ado/policy.js";
import type { AzureWorkItemDetail } from "../ado/workItems.js";

export type PullRequestPreparationAvailability = "available" | "missing" | "unavailable" | "failed";
export type PullRequestReadiness = "ready" | "needs_attention" | "blocked" | "insufficient_evidence";

export interface PullRequestCommitEvidence {
  sha: string;
  subject: string;
}

export interface PullRequestGitEvidence {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  targetSha?: string;
  remoteSourceSha?: string;
  remoteTargetSha?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  dirty: boolean;
  changedFiles: string[];
  diffStat: string;
  commits: PullRequestCommitEvidence[];
  targetAvailability: PullRequestPreparationAvailability;
}

export interface PullRequestValidationEvidence {
  status: "passed" | "failed" | "not_run" | "unavailable";
  command?: string;
  summary: string;
  sourceSha?: string;
  durationMs?: number;
  outputExcerpt?: string;
}

export interface PullRequestPolicyEvidence {
  status: PullRequestPreparationAvailability;
  targetRef: string;
  configurations: AzureBranchPolicyConfiguration[];
  message?: string;
}

export interface PullRequestWorkItemEvidence {
  status: PullRequestPreparationAvailability;
  item?: AzureWorkItemDetail;
  message?: string;
}

export interface PullRequestSuggestion {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  draft: boolean;
  workItemId?: number;
  reviewerFocus: string[];
  risks: string[];
  missingEvidence: string[];
  readiness: PullRequestReadiness;
}

export interface PullRequestPreparation {
  projectLinkId: string;
  repositoryId: string;
  generatedAt: number;
  git: PullRequestGitEvidence;
  validation: PullRequestValidationEvidence;
  workItem: PullRequestWorkItemEvidence;
  policies: PullRequestPolicyEvidence;
  suggestion: PullRequestSuggestion;
}

export interface PullRequestSuggestionPreferences {
  sourceBranch?: string;
  targetBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
  workItemId?: number;
}

export function buildPullRequestPreparation(args: {
  projectLinkId: string;
  repositoryId: string;
  git: PullRequestGitEvidence;
  validation: PullRequestValidationEvidence;
  workItem: PullRequestWorkItemEvidence;
  policies: PullRequestPolicyEvidence;
  preferences?: PullRequestSuggestionPreferences;
  generatedAt?: number;
}): PullRequestPreparation {
  const preferences = args.preferences ?? {};
  // The source branch is an observed local fact, not an editable suggestion.
  // A preference must never relabel HEAD as a different branch.
  const sourceBranch = args.git.sourceBranch;
  const targetBranch = preferences.targetBranch?.trim() || args.git.targetBranch;
  const workItem = args.workItem.item;
  const firstCommit = args.git.commits[0];
  const title = preferences.title?.trim()
    || workItem?.title.trim()
    || firstCommit?.subject.trim()
    || humanizeBranch(sourceBranch);
  const missingEvidence: string[] = [];
  const risks: string[] = [];

  if (!sourceBranch) missingEvidence.push("Source branch is unknown.");
  if (!targetBranch) missingEvidence.push("Target branch is not configured.");
  if (!args.git.headSha) missingEvidence.push("HEAD commit could not be read.");
  if (sourceBranch && !args.git.remoteSourceSha) {
    missingEvidence.push("The source branch is not available in Azure DevOps; push it before creating the PR.");
  } else if (args.git.remoteSourceSha && args.git.remoteSourceSha !== args.git.headSha) {
    missingEvidence.push("The local HEAD and Azure DevOps source branch revisions do not match.");
  }
  if (targetBranch && !args.git.remoteTargetSha) {
    missingEvidence.push("The target branch revision could not be read from Azure DevOps.");
  }
  if (args.git.targetAvailability !== "available") {
    missingEvidence.push("The target branch revision is not available in the local repository.");
  }
  if (args.git.dirty) risks.push("The working tree has uncommitted changes that are not part of the proposed PR.");
  if (args.git.commits.length === 0 && args.git.changedFiles.length === 0) {
    missingEvidence.push("No committed or working-tree changes were found against the target branch.");
  }
  if (args.validation.status !== "passed") {
    missingEvidence.push(args.validation.status === "failed"
      ? "Current-SHA validation failed."
      : "Current-SHA validation has not passed yet.");
  }
  if (args.workItem.status !== "available") {
    missingEvidence.push(args.workItem.message || "No verified Work Item evidence is attached.");
  }
  if (args.policies.status !== "available") {
    missingEvidence.push(args.policies.message || "Target branch policies could not be verified.");
  }
  const enabledBlockingPolicies = args.policies.configurations.filter((policy) => policy.isEnabled && policy.isBlocking);
  if (enabledBlockingPolicies.length > 0) {
    risks.push(`The target branch has ${enabledBlockingPolicies.length} blocking policy ${enabledBlockingPolicies.length === 1 ? "requirement" : "requirements"}.`);
  }

  const blocked = !args.repositoryId || !sourceBranch || !targetBranch || sourceBranch === targetBranch || !args.git.headSha
    || !args.git.remoteSourceSha || args.git.remoteSourceSha !== args.git.headSha
    || args.validation.status === "failed";
  if (sourceBranch && targetBranch && sourceBranch === targetBranch) {
    risks.push("Source and target branches are the same.");
  }
  const evidenceUnavailable = args.git.targetAvailability === "failed"
    || args.workItem.status === "failed"
    || args.policies.status === "failed";
  const readiness: PullRequestReadiness = blocked
    ? "blocked"
    : evidenceUnavailable
      ? "insufficient_evidence"
      : missingEvidence.length > 0 || risks.length > 0
        ? "needs_attention"
        : "ready";

  const description = preferences.description?.trim() || buildDescription({
    workItem,
    commits: args.git.commits,
    changedFiles: args.git.changedFiles,
    validation: args.validation,
    policies: args.policies,
    risks,
  });

  return {
    projectLinkId: args.projectLinkId,
    repositoryId: args.repositoryId,
    generatedAt: args.generatedAt ?? Date.now(),
    git: { ...args.git, sourceBranch, targetBranch },
    validation: args.validation,
    workItem: args.workItem,
    policies: { ...args.policies, targetRef: normalizeRef(targetBranch) },
    suggestion: {
      sourceBranch,
      targetBranch,
      title,
      description,
      draft: preferences.draft ?? false,
      workItemId: preferences.workItemId ?? workItem?.id,
      reviewerFocus: reviewerFocus(args.git.changedFiles, workItem),
      risks,
      missingEvidence,
      readiness,
    },
  };
}

function buildDescription(args: {
  workItem?: AzureWorkItemDetail;
  commits: PullRequestCommitEvidence[];
  changedFiles: string[];
  validation: PullRequestValidationEvidence;
  policies: PullRequestPolicyEvidence;
  risks: string[];
}): string {
  const lines = ["## Summary"];
  if (args.workItem) lines.push(args.workItem.description || args.workItem.title);
  else if (args.commits.length > 0) lines.push(args.commits.slice(0, 3).map((commit) => `- ${commit.subject}`).join("\n"));
  else lines.push("Describe the user-visible change.");

  lines.push("", "## Evidence");
  lines.push(`- Changed files: ${args.changedFiles.length}`);
  lines.push(`- Commits against target: ${args.commits.length}`);
  lines.push(`- Validation: ${args.validation.summary}`);
  lines.push(`- Target policies: ${policySummary(args.policies)}`);
  if (args.workItem) lines.push(`- Work Item: #${args.workItem.id} (${args.workItem.state})`);

  lines.push("", "## Reviewer focus");
  for (const focus of reviewerFocus(args.changedFiles, args.workItem)) lines.push(`- ${focus}`);
  if (args.risks.length > 0) {
    lines.push("", "## Risks");
    for (const risk of args.risks) lines.push(`- ${risk}`);
  }
  return lines.join("\n");
}

function reviewerFocus(files: string[], workItem?: AzureWorkItemDetail): string[] {
  const focus: string[] = [];
  if (workItem?.acceptanceCriteria) focus.push("Verify the Work Item acceptance criteria against the changed behavior.");
  if (files.some((file) => /test|spec/i.test(file))) focus.push("Review the changed test coverage and failure paths.");
  if (files.some((file) => /pipeline|ya?ml|deploy/i.test(file))) focus.push("Review CI/CD and deployment behavior.");
  if (files.length > 0) focus.push(`Review the ${files.length} changed ${files.length === 1 ? "file" : "files"} for scope and regressions.`);
  return focus.length > 0 ? focus : ["Confirm the proposed scope before creating the pull request."];
}

function policySummary(policies: PullRequestPolicyEvidence): string {
  if (policies.status !== "available") return policies.message || policies.status;
  const enabled = policies.configurations.filter((policy) => policy.isEnabled);
  if (enabled.length === 0) return "No enabled policy configurations were returned for the target ref.";
  return enabled.map((policy) => `${policy.displayName}${policy.isBlocking ? " (blocking)" : ""}`).join(", ");
}

function humanizeBranch(branch: string): string {
  const leaf = branch.split("/").filter(Boolean).at(-1) ?? "Prepare pull request";
  return leaf.replace(/[-_]+/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function normalizeRef(branch: string): string {
  const trimmed = branch.trim();
  return trimmed && !trimmed.startsWith("refs/") ? `refs/heads/${trimmed}` : trimmed;
}
