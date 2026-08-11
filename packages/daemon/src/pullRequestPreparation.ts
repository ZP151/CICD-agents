import {
  buildPullRequestPreparation,
  getAzureDevOpsAuth,
  listAzureBranchPolicyConfigurations,
  listAzureRepositories,
  readAzureBranchObjectId,
  readAzureWorkItemDetail,
  runCommand,
  type AdoAuth,
  type AzureBranchPolicyConfiguration,
  type AzureDevOpsDiscoveryOption,
  type AzureWorkItemDetail,
  type ProjectLink,
  type PullRequestGitEvidence,
  type PullRequestPreparation,
  type PullRequestSuggestionPreferences,
  type PullRequestValidationEvidence,
} from "@mergepilot/core";

interface GitCommandResult {
  returncode: number;
  stdout: string;
  stderr: string;
}

export interface PullRequestPreparationDependencies {
  runGit: (repoPath: string, args: string[]) => Promise<GitCommandResult>;
  getAuth: (pat?: string) => Promise<AdoAuth>;
  listRepositories: (args: {
    organization: string;
    project: string;
    auth: AdoAuth;
    top: number;
  }) => Promise<AzureDevOpsDiscoveryOption[]>;
  readWorkItem: (args: {
    organization: string;
    project: string;
    workItemId: number;
    auth: AdoAuth;
  }) => Promise<AzureWorkItemDetail>;
  listBranchPolicies: (args: {
    organization: string;
    project: string;
    repositoryId: string;
    refName: string;
    auth: AdoAuth;
  }) => Promise<AzureBranchPolicyConfiguration[]>;
  readBranch: (args: {
    organization: string;
    project: string;
    repository: string;
    branch: string;
    auth: AdoAuth;
  }) => Promise<{ objectId: string } | undefined>;
  now: () => number;
}

const DEFAULT_DEPENDENCIES: PullRequestPreparationDependencies = {
  runGit: async (repoPath, args) => {
    const result = await runCommand(["git", ...args], { cwd: repoPath, allowed: ["git"], timeoutSec: 20 });
    return {
      returncode: result.returncode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },
  getAuth: (pat) => getAzureDevOpsAuth(pat),
  listRepositories: (args) => listAzureRepositories(args),
  readWorkItem: (args) => readAzureWorkItemDetail(args),
  listBranchPolicies: (args) => listAzureBranchPolicyConfigurations(args),
  readBranch: (args) => readAzureBranchObjectId(args),
  now: () => Date.now(),
};

export async function preparePullRequest(args: {
  projectLink: ProjectLink;
  preferences?: PullRequestSuggestionPreferences;
  validation?: PullRequestValidationEvidence;
  dependencies?: Partial<PullRequestPreparationDependencies>;
}): Promise<PullRequestPreparation> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...args.dependencies };
  const preferences = args.preferences ?? {};
  const targetBranch = preferences.targetBranch?.trim()
    || args.projectLink.targetBranch.trim()
    || args.projectLink.defaultBranch.trim();
  const git = await readGitEvidence(args.projectLink.repoPath, targetBranch, dependencies.runGit);

  const organization = args.projectLink.adoOrgUrl.trim();
  const project = args.projectLink.adoProject.trim();
  const configuredRepository = args.projectLink.adoRepoName.trim();
  let repositoryId = "";
  let workItem: Parameters<typeof buildPullRequestPreparation>[0]["workItem"] = {
    status: preferences.workItemId ? "unavailable" : "missing",
    message: preferences.workItemId
      ? "Work Item evidence is unavailable until the Azure DevOps repository mapping is resolved."
      : "No Work Item was selected for this preparation.",
  };
  let policies: Parameters<typeof buildPullRequestPreparation>[0]["policies"] = {
    status: "unavailable",
    targetRef: normalizeRef(targetBranch),
    configurations: [],
    message: "Azure DevOps target branch policy evidence is unavailable because the Project Link mapping is incomplete.",
  };

  if (organization && project && configuredRepository) {
    try {
      const auth = await dependencies.getAuth(args.projectLink.adoPat);
      const repositories = await dependencies.listRepositories({ organization, project, auth, top: 500 });
      const repository = repositories.find((candidate) =>
        candidate.id === configuredRepository
        || candidate.name.localeCompare(configuredRepository, undefined, { sensitivity: "accent" }) === 0
      );
      repositoryId = repository?.id?.trim() ?? "";
      if (!repositoryId) {
        policies = {
          status: "failed",
          targetRef: normalizeRef(targetBranch),
          configurations: [],
          message: `Azure DevOps repository '${configuredRepository}' was not found.`,
        };
      } else {
        const [policyResult, workItemResult, sourceBranchResult, targetBranchResult] = await Promise.allSettled([
          dependencies.listBranchPolicies({
            organization,
            project,
            repositoryId,
            refName: targetBranch,
            auth,
          }),
          preferences.workItemId
            ? dependencies.readWorkItem({ organization, project, workItemId: preferences.workItemId, auth })
            : Promise.resolve(undefined),
          git.sourceBranch
            ? dependencies.readBranch({ organization, project, repository: repositoryId, branch: git.sourceBranch, auth })
            : Promise.resolve(undefined),
          targetBranch
            ? dependencies.readBranch({ organization, project, repository: repositoryId, branch: targetBranch, auth })
            : Promise.resolve(undefined),
        ]);
        if (sourceBranchResult.status === "fulfilled" && sourceBranchResult.value?.objectId) {
          git.remoteSourceSha = sourceBranchResult.value.objectId;
        }
        if (targetBranchResult.status === "fulfilled" && targetBranchResult.value?.objectId) {
          git.remoteTargetSha = targetBranchResult.value.objectId;
        }
        policies = policyResult.status === "fulfilled"
          ? {
            status: "available",
            targetRef: normalizeRef(targetBranch),
            configurations: policyResult.value,
          }
          : {
            status: "failed",
            targetRef: normalizeRef(targetBranch),
            configurations: [],
            message: safeReadFailure("Target branch policy read failed", policyResult.reason),
          };
        if (preferences.workItemId) {
          workItem = workItemResult.status === "fulfilled" && workItemResult.value
            ? { status: "available", item: workItemResult.value }
            : {
              status: "failed",
              message: safeReadFailure(`Work Item ${preferences.workItemId} read failed`,
                workItemResult.status === "rejected" ? workItemResult.reason : undefined),
            };
        }
      }
    } catch (error) {
      const message = safeReadFailure("Azure DevOps evidence initialization failed", error);
      policies = {
        status: "failed",
        targetRef: normalizeRef(targetBranch),
        configurations: [],
        message,
      };
      if (preferences.workItemId) workItem = { status: "failed", message };
    }
  }

  return buildPullRequestPreparation({
    projectLinkId: args.projectLink.id,
    repositoryId,
    git,
    validation: args.validation?.sourceSha === git.headSha
      ? args.validation
      : {
        status: "not_run",
        summary: "No current-SHA validation has been run for this preparation.",
        sourceSha: git.headSha || undefined,
      },
    workItem,
    policies,
    preferences,
    generatedAt: dependencies.now(),
  });
}

async function readGitEvidence(
  repoPath: string,
  targetBranch: string,
  runGit: PullRequestPreparationDependencies["runGit"],
): Promise<PullRequestGitEvidence> {
  const [branchResult, headResult, statusResult, upstreamResult] = await Promise.all([
    runGit(repoPath, ["branch", "--show-current"]),
    runGit(repoPath, ["rev-parse", "HEAD"]),
    runGit(repoPath, ["status", "--porcelain=v1"]),
    runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
  ]);
  const sourceBranch = okText(branchResult);
  const headSha = okText(headResult);
  const targetRef = await resolveTargetRef(repoPath, targetBranch, runGit);
  const targetShaResult = targetRef
    ? await runGit(repoPath, ["rev-parse", targetRef])
    : failedGitResult("target ref unavailable");
  const targetSha = okText(targetShaResult);
  const [divergenceResult, commitsResult, diffStatResult, changedFilesResult] = targetRef
    ? await Promise.all([
      runGit(repoPath, ["rev-list", "--left-right", "--count", `${targetRef}...HEAD`]),
      runGit(repoPath, ["log", "--format=%H%x09%s", `${targetRef}..HEAD`]),
      runGit(repoPath, ["diff", "--stat", "--no-renames", `${targetRef}...HEAD`]),
      runGit(repoPath, ["diff", "--name-only", `${targetRef}...HEAD`]),
    ])
    : [failedGitResult("target ref unavailable"), failedGitResult("target ref unavailable"), failedGitResult("target ref unavailable"), failedGitResult("target ref unavailable")];
  const [behind, ahead] = parseDivergence(okText(divergenceResult));

  return {
    repoPath,
    sourceBranch,
    targetBranch,
    headSha,
    targetSha: targetSha || undefined,
    upstream: okText(upstreamResult) || undefined,
    ahead,
    behind,
    dirty: Boolean(okText(statusResult)),
    changedFiles: lines(okText(changedFilesResult)),
    diffStat: okText(diffStatResult),
    commits: lines(okText(commitsResult)).map((line) => {
      const separator = line.indexOf("\t");
      return separator >= 0
        ? { sha: line.slice(0, separator), subject: line.slice(separator + 1) }
        : { sha: line, subject: "" };
    }).filter((commit) => commit.sha),
    targetAvailability: targetRef && targetSha ? "available" : targetBranch ? "missing" : "unavailable",
  };
}

async function resolveTargetRef(
  repoPath: string,
  targetBranch: string,
  runGit: PullRequestPreparationDependencies["runGit"],
): Promise<string> {
  if (!targetBranch) return "";
  const candidates = targetBranch.startsWith("refs/")
    ? [targetBranch]
    : [`refs/remotes/origin/${targetBranch}`, `refs/heads/${targetBranch}`];
  for (const candidate of candidates) {
    const result = await runGit(repoPath, ["rev-parse", "--verify", candidate]);
    if (result.returncode === 0 && result.stdout.trim()) return candidate;
  }
  return "";
}

function okText(result: GitCommandResult): string {
  return result.returncode === 0 ? result.stdout.trim() : "";
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseDivergence(text: string): [number | undefined, number | undefined] {
  const [left, right] = text.split(/\s+/).map(Number);
  return Number.isFinite(left) && Number.isFinite(right) ? [left, right] : [undefined, undefined];
}

function failedGitResult(stderr: string): GitCommandResult {
  return { returncode: 1, stdout: "", stderr };
}

function normalizeRef(branch: string): string {
  const trimmed = branch.trim();
  return trimmed && !trimmed.startsWith("refs/") ? `refs/heads/${trimmed}` : trimmed;
}

function safeReadFailure(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "unknown error");
  return `${prefix}: ${detail}`.slice(0, 500);
}
