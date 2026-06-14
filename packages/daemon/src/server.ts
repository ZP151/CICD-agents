import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import nodeFs from "node:fs";
import nodeOs from "node:os";

let activeEnvFile: string | null = null;
let azureDeploymentProbeCache: {
  key: string;
  checkedAt: number;
  available: boolean;
  error: string;
} | null = null;

// Resolve .env in priority order:
//   1. CICD_AGENT_ENV_FILE env var (explicit override)
//   2. <cwd>/.env          (development / manual)
//   3. monorepo root       (development when cwd is a package)
//   4. ~/.cicd-agent/.env  (installed app / user-level fallback)
(function loadEnv() {
  const moduleDir = (() => {
    try {
      return nodePath.dirname(fileURLToPath(import.meta.url));
    } catch {
      return null;
    }
  })();
  const candidates = [
    process.env.CICD_AGENT_ENV_FILE,
    nodePath.join(process.cwd(), ".env"),
    moduleDir ? nodePath.resolve(moduleDir, "../../..", ".env") : null,
    nodePath.join(nodeOs.homedir(), ".cicd-agent", ".env"),
  ].filter((p): p is string => typeof p === "string");

  for (const p of candidates) {
    if (nodeFs.existsSync(p)) {
      activeEnvFile = p;
      dotenv.config({ path: p });
      break;
    }
  }
})();
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  getSettings,
  runPipelineTask,
  TaskQueue,
  type TaskRunner,
  type TaskView,
  listWorkspaceProfiles,
  getWorkspaceProfile,
  createWorkspaceProfile,
  updateWorkspaceProfile,
  deleteWorkspaceProfile,
  type WorkspaceProfileInput,
  checkAzureDevOpsTools,
  listAzureBuildDefinitions,
  listAzureProjects,
  listAzureRepositories,
  listAzurePullRequests,
  listAzurePipelineRuns,
  getAzurePullRequestById,
  listAzurePullRequestThreads,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestWorkItems,
  listAzureBuilds,
  getAzureBuildTimeline,
  getAzureBuildLogExcerpt,
  getAzureDevOpsAuth,
  adoAuthDiagnosticFromError,
  listReviewQueueItems,
  listLocalReviewHistory,
  upsertLocalReviewHistory,
  type ReviewHistoryRecord,
  appendLocalReviewOperation,
  listLocalReviewOperations,
  type ReviewOperationKind,
  getLocalPrInsightArtifact,
  listLocalPrInsightArtifacts,
  summarizePrInsightArtifactHistory,
  upsertLocalPrInsightArtifact,
  AzureTableProfileStore,
  KeyVaultSecrets,
  getCurrentUser,
  getDesktopAzureAuthConfig,
  isAzureAuthAvailable,
  persistUserCache,
  loadPersistedUser,
  clearPersistedUser,
  getCachedAzureAccounts,
  getAzureDevOpsToken,
  loginWithBrowser,
  loginWithCachedAccount,
  isAzureAuthenticationRequiredError,
  type AdoAuthDiagnostic,
  resetUserCache,
  runCommand,
  previewGitCheckpoint,
  planGitCheckpointRollback,
  LLMClient,
  ChatUiChunkAdapter,
  type PendingToolAction,
  type BrowserLoginChoice,
  type Settings,
} from "@cicd-agent/core";
import { spawnSync } from "node:child_process";
import { SubmitPipelineSchema, TaskIdParam } from "./schemas.js";
import { ChatSessionManager, type InlineLlmConfig, type InlineProfile } from "./chatSession.js";
import { chatEventToSseEvents, sessionStartedEvent } from "./chatEvents.js";
import {
  getChatIndexStatus,
  refreshChatIndex,
} from "@cicd-agent/core/chatContext";
import {
  AdoClient,
  COMMENT_TYPE_TEXT,
  THREAD_STATUS_ACTIVE,
  buildCloudContext,
  runReviewPlanner,
  decideReviewOutcome,
  DEFAULT_AUTO_APPROVAL_POLICY,
  FileStateStore,
} from "@cicd-agent/review-agent";
import { z } from "zod";

export interface BuildAppOptions {
  /** Override the task runner. Defaults to runPipelineTask. */
  runner?: TaskRunner;
}

type AdoDiscoveryKind = "projects" | "repositories" | "pipelines";

interface AdoDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

// Inline LLM config sent from the frontend Settings page (localStorage).
// All fields are optional — missing ones fall back to env / .env defaults.
const LlmConfigSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey:    z.string().optional(),
  openaiModel:     z.string().optional(),
}).optional();

// Inline profile data sent from the frontend Profiles page (localStorage).
// Skips the daemon-side DB lookup entirely.
const InlineProfileSchema = z.object({
  id:              z.string().optional(),
  name:            z.string().optional(),
  repoPath:        z.string().default(""),
  defaultBranch:   z.string().default("main"),
  targetBranch:    z.string().default("main"),
  adoOrgUrl:       z.string().default(""),
  adoProject:      z.string().default(""),
  adoRepoName:     z.string().default(""),
  adoPat:          z.string().default(""),
  adoPipelineId:   z.string().default(""),
  adoPipelineName: z.string().default(""),
  adoMcpEnabled:   z.coerce.boolean().default(false),
  adoMcpCommand:   z.string().default(""),
  adoMcpAuthentication: z.string().default(""),
  adoMcpDomains:   z.string().default("repositories,pipelines,work-items"),
  templateProfile: z.string().default(""),
  buildCommand:    z.string().default(""),
  testCommand:     z.string().default(""),
  ignoredGlobs:    z.array(z.string()).default([]),
}).optional();


const ChatStartSchema = z.object({
  message:   z.string().min(1),
  repoPath:  z.string().default(process.cwd()),
  sessionId: z.string().optional(),
  profileId: z.string().optional(),  // kept for backwards compat; ignored when profile is provided
  llmConfig: LlmConfigSchema,        // inline LLM config from localStorage Settings
  profile:   InlineProfileSchema,    // inline profile data from localStorage Profiles
});
const ChatWorkflowActionSchema = z.object({
  action: z.enum([
    "inspect_environment",
    "inspect_changes",
    "refresh_branch",
    "checkout_branch",
    "create_branch",
    "push_branch",
    "prepare_commit",
    "run_tests",
    "run_build",
    "stage_resolved_conflicts",
    "continue_rebase",
    "abort_rebase",
    "skip_rebase",
    "continue_merge",
    "abort_merge",
    "continue_cherry_pick",
    "abort_cherry_pick",
    "skip_cherry_pick",
    "continue_revert",
    "abort_revert",
    "skip_revert",
    "create_pr",
    "inspect_pr_insight",
    "check_pr_policy",
    "list_pr_work_items",
    "link_work_item",
    "inspect_pipeline",
    "trigger_pipeline",
  ]),
  repoPath: z.string().min(1),
  sessionId: z.string().optional(),
  profileId: z.string().optional(),
  pullRequestId: z.coerce.number().int().positive().optional(),
  workItemId: z.coerce.number().int().positive().optional(),
  branch: z.string().optional(),
  targetBranch: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  draft: z.coerce.boolean().default(false),
  message: z.string().optional(),
  paths: z.array(z.string()).default([]),
  includeUnstaged: z.coerce.boolean().default(true),
  commitMode: z.enum(["commit", "commit-push"]).optional(),
  validationTool: z.enum(["npm_test", "npm_build", "pytest_run", "dotnet_test", "dotnet_build"]).optional(),
  validationScript: z.string().optional(),
  validationArgs: z.array(z.string()).default([]),
  pipelineId: z.coerce.number().int().positive().optional(),
  profile: InlineProfileSchema,
});
const ChatIndexSchema = z.object({
  repoPath: z.string().default(process.cwd()),
  llmConfig: LlmConfigSchema,
  profile: InlineProfileSchema,
});
const ProfilePayloadSchema = z.object({
  profile: InlineProfileSchema,
}).default({});
const AuthAzureDevOpsEnableSchema = z.object({
  browser: z.enum(["default", "edge", "chrome"]).default("default"),
  loginHint: z.string().optional(),
  accountHomeId: z.string().optional(),
}).default({});
const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const ChatSessionMetadataSchema = z.object({
  title: z.string().max(140).nullable().optional(),
  pinned: z.boolean().optional(),
}).refine((value) => "title" in value || "pinned" in value, {
  message: "At least one metadata field is required",
});
const CheckpointIdParam = z.object({ checkpointId: z.string().min(1) });
const CheckpointPreviewQuery = z.object({
  maxDiffChars: z.coerce.number().int().min(0).max(100_000).optional(),
});
const ProfileIdParam = z.object({ id: z.string().min(1) });
const ProfilePullRequestParam = z.object({
  id: z.string().min(1),
  pullRequestId: z.coerce.number().int().positive(),
});

type BranchPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "branch" }>;
type PrPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "pr" }>;

function buildInlineLlmSettings(override?: InlineLlmConfig): Settings {
  const base = getSettings();
  if (!override) return base;
  const isAzure = (override.llmProvider ?? "azure") === "azure";
  const provider: "azure" | "openai" = isAzure ? "azure" : "openai";
  return {
    ...base,
    llmProvider: provider,
    azureOpenAiEndpoint:       isAzure ? (override.azureEndpoint   ?? base.azureOpenAiEndpoint)       : base.azureOpenAiEndpoint,
    azureOpenAiApiKey:         isAzure ? (override.azureApiKey     ?? base.azureOpenAiApiKey)         : base.azureOpenAiApiKey,
    azureOpenAiChatDeployment: isAzure ? (override.azureDeployment ?? base.azureOpenAiChatDeployment) : base.azureOpenAiChatDeployment,
    azureOpenAiApiVersion:     isAzure ? (override.azureApiVersion ?? base.azureOpenAiApiVersion)     : base.azureOpenAiApiVersion,
    openAiApiKey:              !isAzure ? (override.openaiApiKey   ?? base.openAiApiKey)              : base.openAiApiKey,
    openAiModel:               !isAzure ? (override.openaiModel    ?? base.openAiModel)               : base.openAiModel,
    llmConfigured: isAzure
      ? Boolean(
          (override.azureEndpoint ?? base.azureOpenAiEndpoint) &&
          (override.azureApiKey   ?? base.azureOpenAiApiKey),
        )
      : Boolean(
          (override.openaiApiKey ?? base.openAiApiKey) &&
          (override.openaiModel  ?? base.openAiModel),
        ),
  };
}

function inlineProfileToIndexProfile(profile?: InlineProfile) {
  if (!profile) return undefined;
  return {
    buildCommand: profile.buildCommand,
    testCommand: profile.testCommand,
    targetBranch: profile.targetBranch || profile.defaultBranch,
    pipelineName: profile.adoPipelineName,
    ignoredGlobs: profile.ignoredGlobs,
  };
}

const ReviewHistoryUpsertSchema = z.object({
  pullRequestId: z.coerce.number().int().positive(),
  lastIterationId: z.coerce.number().int().nonnegative().default(0),
  findingCount: z.coerce.number().int().nonnegative().default(0),
  lastRunAt: z.string().default(() => new Date().toISOString()),
  sourceCommit: z.string().default(""),
  decisionQueue: z.enum(["auto_approved", "needs_human_review", "blocked", "watching"]).default("needs_human_review"),
  decisionRiskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  decisionReason: z.string().default(""),
  decisionReasonCodes: z.array(z.string()).default([]),
  contextConfidence: z.enum(["high", "medium", "low", ""]).default(""),
  autoApprovedAt: z.string().default(""),
  autoApprovalActor: z.string().default(""),
  lastTokensIn: z.coerce.number().int().nonnegative().optional(),
  lastTokensOut: z.coerce.number().int().nonnegative().optional(),
  discardedFindingCount: z.coerce.number().int().nonnegative().optional(),
  hunkCoverageFiles: z.coerce.number().int().nonnegative().optional(),
  wholeFileFallbackFiles: z.coerce.number().int().nonnegative().optional(),
  changedHunkLines: z.coerce.number().int().nonnegative().optional(),
  manualDisposition: z.enum(["", "acknowledged", "marked_safe", "marked_blocked", "changes_requested"]).default(""),
  manualDispositionAt: z.string().default(""),
  manualDispositionActor: z.string().default(""),
  manualDispositionNote: z.string().default(""),
  manualDispositionEvents: z.array(z.object({
    disposition: z.enum(["acknowledged", "marked_safe", "marked_blocked", "changes_requested"]),
    at: z.string().default(""),
    actor: z.string().default(""),
    note: z.string().default(""),
  })).default([]),
  manualDispositionWriteBackAttempted: z.boolean().default(false),
  manualDispositionWriteBackOk: z.boolean().default(false),
  manualDispositionWriteBackError: z.string().default(""),
  manualDispositionWriteBackAt: z.string().default(""),
  manualDispositionWriteBackThreadId: z.string().default(""),
  manualDispositionWriteBackUrl: z.string().default(""),
  manualDispositionWriteBackEvents: z.array(z.object({
    disposition: z.enum(["acknowledged", "marked_safe", "marked_blocked", "changes_requested"]),
    at: z.string().default(""),
    ok: z.boolean().default(false),
    actor: z.string().default(""),
    note: z.string().default(""),
    error: z.string().default(""),
    threadId: z.string().default(""),
    url: z.string().default(""),
  })).default([]),
});
const ReviewDispositionUpsertSchema = ReviewHistoryUpsertSchema.extend({
  writeBackToAdo: z.boolean().default(true),
});
const ReviewOperationSchema = z.object({
  kind: z.enum(["rerun", "batch_rerun", "stale_rerun", "disposition", "ado_retry", "insight_preview", "review_run"]),
  at: z.string().optional(),
  pullRequestId: z.coerce.number().int().nonnegative().default(0),
  actor: z.string().default("desktop-user"),
  label: z.string().default(""),
  ok: z.boolean().default(true),
  details: z.string().default(""),
});
const PrInsightArtifactSchema = z.object({
  kind: z.enum(["insight_preview", "review_run"]),
  at: z.string().optional(),
  repository: z.string().default(""),
  pullRequestId: z.coerce.number().int().nonnegative(),
  title: z.string().default(""),
  summary: z.string().default(""),
  readiness: z.enum(["ready", "needs_attention", "blocked"]).optional(),
  decisionQueue: z.enum(["auto_approved", "needs_human_review", "blocked", "watching"]).optional(),
  decisionRiskLevel: z.enum(["low", "medium", "high"]).optional(),
  contextConfidence: z.enum(["high", "medium", "low", ""]).optional(),
  risks: z.array(z.string()).default([]),
  categories: z.object({
    blocking: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    info: z.array(z.string()).default([]),
  }).optional(),
  signals: z.object({
    fileCount: z.coerce.number().int().nonnegative().default(0),
    threadCount: z.coerce.number().int().nonnegative().default(0),
    failedBuildCount: z.coerce.number().int().nonnegative().default(0),
    workItemCount: z.coerce.number().int().nonnegative().default(0),
    failedPolicyCount: z.coerce.number().int().nonnegative().optional(),
    buildBlockers: z.array(z.object({
      id: z.coerce.number().int().nonnegative().default(0),
      buildNumber: z.string().default(""),
      definitionName: z.string().default(""),
      status: z.string().default(""),
      result: z.string().default(""),
      url: z.string().default(""),
    })).optional(),
    policyBlockers: z.array(z.object({
      id: z.string().default(""),
      name: z.string().default(""),
      typeName: z.string().default(""),
      status: z.string().default(""),
      isBlocking: z.boolean().default(false),
    })).optional(),
    activeThreads: z.array(z.object({
      id: z.coerce.number().int().nonnegative().default(0),
      status: z.union([z.string(), z.number()]).default(""),
      author: z.string().default(""),
      firstComment: z.string().default(""),
    })).optional(),
    linkedWorkItems: z.array(z.object({
      id: z.coerce.number().int().nonnegative().default(0),
      type: z.string().default(""),
      title: z.string().default(""),
      state: z.string().default(""),
      url: z.string().default(""),
    })).optional(),
  }).optional(),
  iterationId: z.coerce.number().int().nonnegative().optional(),
  sourceCommit: z.string().optional(),
  findingCount: z.coerce.number().int().nonnegative().optional(),
  discardedFindingCount: z.coerce.number().int().nonnegative().optional(),
  tokensIn: z.coerce.number().int().nonnegative().default(0),
  tokensOut: z.coerce.number().int().nonnegative().default(0),
});
const ProfileBodySchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoPipelineId: z.string().default(""),
  adoPipelineName: z.string().default(""),
  adoMcpEnabled: z.coerce.boolean().default(false),
  adoMcpCommand: z.string().default(""),
  adoMcpAuthentication: z.string().default(""),
  adoMcpDomains: z.string().default("repositories,pipelines,work-items"),
  templateProfile: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
});

const AdoDiscoverySchema = z.object({
  kind: z.enum(["projects", "repositories", "pipelines"]),
  profile: ProfileBodySchema.partial().default({}),
});

const AdoMcpCheckSchema = z.object({
  profile: ProfileBodySchema.partial().default({}),
});

async function discoverAdoOptions(
  kind: AdoDiscoveryKind,
  profile: Partial<z.infer<typeof ProfileBodySchema>>,
): Promise<AdoDiscoveryOption[]> {
  const organization = profile.adoOrgUrl ?? "";
  const pat = profile.adoPat ?? "";
  if (kind === "projects") {
    return listAzureProjects({ organization, pat, top: 100 });
  }
  if (kind === "repositories") {
    if (!profile.adoProject) throw new Error("ado_project_required");
    return listAzureRepositories({ organization, project: profile.adoProject, pat, top: 100 });
  }
  if (!profile.adoProject) throw new Error("ado_project_required");
  return listAzureBuildDefinitions({
    organization,
    project: profile.adoProject,
    repositoryId: profile.adoRepoName || undefined,
    repositoryType: profile.adoRepoName ? "TfsGit" : undefined,
    pat,
    top: 100,
  });
}

function sendAdoDiagnostic(reply: FastifyReply, err: unknown, authMode?: "oauth" | "pat") {
  const diagnostic = adoAuthDiagnosticFromError(err, authMode);
  return reply.code(diagnostic.status === "oauth_unavailable" ? 401 : 400).send({
    source: "internal" as const,
    error: diagnostic.message,
    authStatus: diagnostic.status,
    authMode: diagnostic.authMode,
    authMessage: diagnostic.message,
    retryable: diagnostic.retryable,
  });
}

function workflowActionAuthMode(payload: z.infer<typeof ChatWorkflowActionSchema>): "oauth" | "pat" | undefined {
  if (!isAdoPullRequestWorkflowAction(payload.action) && !isAdoPipelineWorkflowAction(payload.action) && payload.action !== "create_pr") return undefined;
  return payload.profile?.adoPat ? "pat" : "oauth";
}

export function workflowActionFailureResponse(
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  err: unknown,
): {
  httpStatus: number;
  body: {
    ok: false;
    action: z.infer<typeof ChatWorkflowActionSchema>["action"];
    repoPath: string;
    sessionId?: string;
    summary: string;
    authStatus?: AdoAuthDiagnostic["status"];
    authMode?: AdoAuthDiagnostic["authMode"];
    authMessage?: string;
    retryable?: boolean;
    workflowState: {
      status: "failed";
      currentStep: string;
      completedTools: string[];
      workflowKind?: "pr" | "ci";
      workflowPhase?: string;
      authStatus?: AdoAuthDiagnostic["status"];
      authMode?: AdoAuthDiagnostic["authMode"];
      authMessage?: string;
      retryable?: boolean;
    };
    tools: [];
  };
} {
  const summary = err instanceof Error ? err.message : String(err);
  const authMode = workflowActionAuthMode(payload);
  const diagnostic = authMode ? adoAuthDiagnosticFromError(err, authMode) : undefined;
  const isAuthFailure = Boolean(diagnostic && diagnostic.status !== "unknown_error");
  const authCurrentStep = diagnostic?.status === "oauth_unavailable"
    ? "Azure DevOps OAuth unavailable"
    : diagnostic?.status === "oauth_no_org_access"
      ? "Azure DevOps OAuth access rejected"
      : diagnostic?.status === "pat_invalid_or_missing_scope"
        ? "Azure DevOps PAT rejected"
        : undefined;
  const workflowState = {
    status: "failed" as const,
    currentStep: isAuthFailure ? authCurrentStep ?? "Azure DevOps authentication failed" : "Workflow action failed",
    completedTools: [],
    ...(isAdoPullRequestWorkflowAction(payload.action) || payload.action === "create_pr" ? { workflowKind: "pr" as const } : {}),
    ...(isAdoPipelineWorkflowAction(payload.action) ? { workflowKind: "ci" as const } : {}),
    ...(isAuthFailure ? {
      workflowPhase: "auth_required",
      authStatus: diagnostic?.status,
      authMode: diagnostic?.authMode,
      authMessage: diagnostic?.message,
      retryable: diagnostic?.retryable,
    } : {}),
  };
  return {
    httpStatus: isAuthFailure
      ? diagnostic?.status === "oauth_unavailable" ? 401 : 400
      : 500,
    body: {
      ok: false,
      action: payload.action,
      repoPath: payload.repoPath,
      sessionId: payload.sessionId,
      summary: isAuthFailure ? diagnostic?.message ?? summary : summary,
      ...(isAuthFailure ? {
        authStatus: diagnostic?.status,
        authMode: diagnostic?.authMode,
        authMessage: diagnostic?.message,
        retryable: diagnostic?.retryable,
      } : {}),
      workflowState,
      tools: [],
    },
  };
}

interface AzureDevOpsRemoteSuggestion {
  remoteName: string;
  remoteUrl: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
}

function cleanRemotePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAzureDevOpsRemote(remoteName: string, remoteUrl: string): AzureDevOpsRemoteSuggestion | null {
  const raw = remoteUrl.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean).map(cleanRemotePart);
    if (host === "dev.azure.com" && parts.length >= 4 && parts[2] === "_git") {
      return {
        remoteName,
        remoteUrl: raw,
        adoOrgUrl: `https://dev.azure.com/${parts[0]}`,
        adoProject: parts[1] ?? "",
        adoRepoName: parts[3] ?? "",
      };
    }
    if (host.endsWith(".visualstudio.com") && parts.length >= 3 && parts[1] === "_git") {
      const org = host.slice(0, -".visualstudio.com".length);
      return {
        remoteName,
        remoteUrl: raw,
        adoOrgUrl: `https://dev.azure.com/${org}`,
        adoProject: parts[0] ?? "",
        adoRepoName: parts[2] ?? "",
      };
    }
  } catch {
    // SSH remotes and scp-like remotes are parsed below.
  }

  const sshMatch = raw.match(/(?:^|@)(?:ssh\.)?dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, org = "", project = "", repo = ""] = sshMatch;
    return {
      remoteName,
      remoteUrl: raw,
      adoOrgUrl: `https://dev.azure.com/${cleanRemotePart(org)}`,
      adoProject: cleanRemotePart(project),
      adoRepoName: cleanRemotePart(repo),
    };
  }

  return null;
}

async function runGitProbe(repoPath: string, args: string[], timeoutSec = 10) {
  const result = await runCommand(["git", ...args], {
    cwd: repoPath,
    allowed: ["git"],
    timeoutSec,
  });
  return {
    command: `git ${args.join(" ")}`,
    ok: result.returncode === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    returncode: result.returncode,
  };
}

async function runWorkspaceWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: z.infer<typeof ChatWorkflowActionSchema>,
) {
  const { action, repoPath } = payload;
  if (isAdoPullRequestWorkflowAction(action)) {
    return runAdoPullRequestWorkflowAction(chatSessions, payload);
  }
  if (isAdoPipelineWorkflowAction(action)) {
    return runAdoPipelineWorkflowAction(chatSessions, payload);
  }

  const tools: Array<Awaited<ReturnType<typeof runGitProbe>> & { name: string }> = [];
  const add = async (name: string, args: string[], timeoutSec?: number) => {
    tools.push({ name, ...await runGitProbe(repoPath, args, timeoutSec) });
  };

  if (action === "inspect_environment") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_branch_list", ["branch", "-a"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_remote", ["remote", "-v"]);
    await add("git_diff", ["diff", "--stat"], 20);
  } else if (action === "inspect_changes") {
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_diff", ["diff", "--stat"], 20);
    await add("git_diff_name_only", ["diff", "--name-only"], 20);
  } else if (action === "refresh_branch") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_branch_list", ["branch", "-a"]);
  } else if (action === "checkout_branch" || action === "create_branch") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_branch_list", ["branch", "-a"]);
  } else if (action === "push_branch") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_remote", ["remote", "-v"]);
    await add("git_upstream", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    const upstream = tools.find((tool) => tool.name === "git_upstream" && tool.ok)?.stdout.trim();
    if (upstream) await add("git_divergence", ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
  } else if (action === "prepare_commit") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_diff", ["diff", "--stat"], 20);
    await add("git_diff_staged", ["diff", "--cached", "--stat"], 20);
    await add("git_log", ["log", "-5", "--oneline"], 20);
  } else if (action === "run_tests" || action === "run_build") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_diff", ["diff", "--stat"], 20);
    await add("git_diff_name_only", ["diff", "--name-only"], 20);
  } else if (action === "stage_resolved_conflicts") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
  } else if (isGitRecoveryWorkflowAction(action)) {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
  } else if (action === "create_pr") {
    await add("git_current_branch", ["branch", "--show-current"]);
    await add("git_status", ["status", "--porcelain=v1", "-b"]);
    await add("git_dir", ["rev-parse", "--git-dir"]);
    await add("git_log_subject", ["log", "-1", "--pretty=%s"], 20);
    await add("git_remote", ["remote", "-v"]);
  }

  const nonBlockingFailures = new Set(
    action === "prepare_commit"
      ? ["git_log", "git_diff_staged"]
      : action === "push_branch"
        ? ["git_upstream", "git_divergence"]
        : [],
  );
  const failed = tools.find((tool) => !tool.ok && !nonBlockingFailures.has(tool.name));
  const currentBranch = tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() || "";
  const statusText = tools.find((tool) => tool.name === "git_status")?.stdout.trim() || "";
  const diffStat = tools.find((tool) => tool.name === "git_diff")?.stdout.trim() || "";
  const changedFiles = changedFilesFromGitOutputs(
    tools.find((tool) => tool.name === "git_diff_name_only")?.stdout ?? "",
    statusText,
  );
  const operationState = gitOperationStateFromTools(repoPath, statusText, tools);
  const operationBlock = gitOperationBlockForAction(action, operationState);

  if (!failed && operationBlock) {
    return {
      ok: false,
      action,
      repoPath,
      sessionId: payload.sessionId,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
      workflowState: {
        status: "blocked",
        workflowKind: "git",
        workflowPhase: operationBlock.workflowPhase,
        currentStep: operationBlock.summary,
        completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      },
      tools,
    };
  }

  const preflight = failed ? undefined : await preflightFromTools(chatSessions, action, payload, tools, statusText);
  const proposal = failed ? undefined : buildWorkspaceWorkflowProposal(
    action,
    payload,
    currentBranch,
    statusText,
    pushReadinessFromTools(tools),
    preflight,
    operationState,
  );
  if (proposal) {
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      profileId: payload.profileId,
      inlineProfile: payload.profile,
      proposal,
      currentStep: proposal.description,
      riskLevel: workflowRiskForAction(action, statusText, proposal.preflight),
      explanation: proposal.description,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
      workflowState,
      tools,
    };
  }

  return {
    ok: !failed,
    action,
    repoPath,
    sessionId: payload.sessionId,
    summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState }),
    workflowState: {
      status: failed ? "failed" : "done",
      currentStep: failed ? `${failed.name} failed` : `${action} complete`,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
    },
    tools,
  };
}

function isAdoPullRequestWorkflowAction(action: string): boolean {
  return [
    "inspect_pr_insight",
    "check_pr_policy",
    "list_pr_work_items",
    "link_work_item",
  ].includes(action);
}

function isAdoPipelineWorkflowAction(action: string): boolean {
  return [
    "inspect_pipeline",
    "trigger_pipeline",
  ].includes(action);
}

type GitRecoveryWorkflowAction =
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

function isGitRecoveryWorkflowAction(action: string): action is GitRecoveryWorkflowAction {
  return Object.hasOwn(GIT_RECOVERY_ACTIONS, action);
}

type ValidationPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "validation" }>;

interface WorkflowActionArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

async function runAdoPipelineWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: z.infer<typeof ChatWorkflowActionSchema>,
) {
  const { action, repoPath } = payload;
  const profile = adoPipelineProfileFromWorkflowPayload(payload);
  const pipelineId = pipelineIdFromWorkflowPayload(payload, profile);
  const auth = await getAzureDevOpsAuth(profile.adoPat);

  if (action === "trigger_pipeline") {
    const branch = String(payload.branch ?? profile.defaultBranch ?? "").trim();
    const proposal: PendingToolAction = {
      tool: "ado_trigger_pipeline",
      args: {
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        pipeline_id: pipelineId,
        ...(branch ? { branch } : {}),
      },
      description: `Trigger Azure Pipeline #${pipelineId}${branch ? ` on ${branch}` : ""}.`,
      nextHint: "inspect pipeline run status",
      workflow: {
        kind: "ci",
        phase: "pipeline_trigger",
        branch: branch || undefined,
        message: `Pipeline #${pipelineId}`,
      },
    };
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      profileId: payload.profileId,
      inlineProfile: payload.profile,
      proposal,
      currentStep: proposal.description,
      riskLevel: "high",
      explanation: proposal.description,
      completedTools: [],
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: proposal.description,
      workflowState,
      tools: [],
    };
  }

  const sessionId = payload.sessionId ?? chatSessions.createSession(repoPath, payload.profileId);
  const runs = await listAzurePipelineRuns({
    organization: profile.adoOrgUrl,
    project: profile.adoProject,
    pipelineId,
    auth,
    top: 10,
  });
  const failureTimeline = await pipelineFailureTimeline(profile, runs, auth);
  const timelineTools = failureTimeline.timeline
    ? [
        adoWorkflowTool("ado_get_build_timeline", failureTimeline.timeline),
        ...(failureTimeline.logExcerpts?.length
          ? [adoWorkflowTool("ado_get_build_log_excerpt", {
              buildId: failureTimeline.timeline.buildId,
              excerpts: failureTimeline.logExcerpts,
              count: failureTimeline.logExcerpts.length,
            })]
          : []),
      ]
    : [];
  const result = adoWorkflowDoneResult({
    action,
    repoPath,
    sessionId,
    workflowKind: "ci",
    phase: "pipeline_inspected",
    currentStep: `Pipeline #${pipelineId} readiness inspected`,
    summary: summarizePipelineRuns(pipelineId, runs),
    tools: [
      adoWorkflowTool("ado_list_pipeline_runs", { pipelineId, runs, count: runs.length }),
      ...timelineTools,
    ],
    artifacts: pipelineFailureArtifacts(
      pipelineId,
      runs,
      failureTimeline.timeline,
      failureTimeline.logExcerpts,
      failureTimeline.error,
    ),
  });
  await appendWorkflowActionAssistantBubble(chatSessions, sessionId, result.summary, result.artifacts);
  return result;
}

async function runAdoPullRequestWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: z.infer<typeof ChatWorkflowActionSchema>,
) {
  const { action, repoPath } = payload;
  const profile = adoProfileFromWorkflowPayload(payload);
  const auth = await getAzureDevOpsAuth(profile.adoPat);
  const pullRequestId = await resolveWorkflowPullRequestId(profile, auth, payload.pullRequestId);
  const baseArgs = {
    organization: profile.adoOrgUrl,
    project: profile.adoProject,
    repository: profile.adoRepoName,
    pullRequestId,
    auth,
  };

  if (action === "link_work_item") {
    const workItemId = Number(payload.workItemId ?? 0);
    if (!workItemId) throw new Error("Work item ID is required before linking it to a pull request.");
    const proposal: PendingToolAction = {
      tool: "ado_link_work_item",
      args: {
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        repository: profile.adoRepoName,
        pull_request_id: pullRequestId,
        work_item_id: workItemId,
      },
      description: `Link work item ${workItemId} to pull request #${pullRequestId}.`,
      nextHint: "list linked work items",
      workflow: {
        kind: "pr",
        phase: "link_work_item",
        message: `Work item ${workItemId} -> PR #${pullRequestId}`,
      },
    };
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      profileId: payload.profileId,
      inlineProfile: payload.profile,
      proposal,
      currentStep: proposal.description,
      riskLevel: "high",
      explanation: proposal.description,
      completedTools: [],
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: proposal.description,
      workflowState,
      tools: [],
    };
  }

  if (action === "check_pr_policy") {
    const policies = await listAzurePullRequestPolicyEvaluations(baseArgs);
    const blocking = policies.filter((policy) => policy.isBlocking);
    return adoWorkflowDoneResult({
      action,
      repoPath,
      sessionId: payload.sessionId,
      phase: "policy_checked",
      currentStep: `Policy status checked for PR #${pullRequestId}`,
      summary: summarizePolicies(pullRequestId, policies),
      tools: [
        adoWorkflowTool("ado_list_pull_request_policy_evaluations", { policies, count: policies.length, blocking }),
      ],
    });
  }

  if (action === "list_pr_work_items") {
    const workItems = await listAzurePullRequestWorkItems(baseArgs);
    return adoWorkflowDoneResult({
      action,
      repoPath,
      sessionId: payload.sessionId,
      phase: "work_items_listed",
      currentStep: `Linked work items listed for PR #${pullRequestId}`,
      summary: summarizeWorkItems(pullRequestId, workItems),
      tools: [
        adoWorkflowTool("ado_list_pull_request_work_items", { workItems, count: workItems.length }),
      ],
    });
  }

  const pullRequest = await getAzurePullRequestById({
    organization: profile.adoOrgUrl,
    project: profile.adoProject,
    repository: profile.adoRepoName,
    pullRequestId,
    auth,
    includeWorkItemRefs: true,
  });
  const [threads, changes, builds, workItems, policies] = await Promise.all([
    listAzurePullRequestThreads({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      pullRequestId,
      auth,
      top: 100,
    }),
    listAzurePullRequestChanges({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      pullRequestId,
      auth,
      top: 100,
    }),
    profile.adoPipelineId
      ? listAzureBuilds({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        auth,
        definitions: [profile.adoPipelineId],
        branchName: pullRequest.sourceBranch,
        top: 20,
      }).catch(() => [])
      : Promise.resolve([]),
    listAzurePullRequestWorkItems({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      pullRequestId,
      auth,
    }).catch(() => []),
    listAzurePullRequestPolicyEvaluations({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      pullRequestId,
      auth,
    }).catch(() => []),
  ]);
  const insight = buildWorkflowPrInsight({ pullRequest, threads, changes, builds, workItems, policies });
  return adoWorkflowDoneResult({
    action,
    repoPath,
    sessionId: payload.sessionId,
    phase: "inspected",
    currentStep: `PR #${pullRequestId} insight inspected`,
    summary: insight.summary,
    tools: [
      adoWorkflowTool("ado_get_pull_request_by_id", pullRequest),
      adoWorkflowTool("ado_list_pull_request_threads", { threads, count: threads.length }),
      adoWorkflowTool("ado_get_pull_request_changes", changes),
      adoWorkflowTool("ado_pipelines_get_builds", { builds, count: builds.length }),
      adoWorkflowTool("ado_list_pull_request_work_items", { workItems, count: workItems.length }),
      adoWorkflowTool("ado_list_pull_request_policy_evaluations", { policies, count: policies.length }),
    ],
  });
}

function adoProfileFromWorkflowPayload(payload: z.infer<typeof ChatWorkflowActionSchema>): NonNullable<z.infer<typeof InlineProfileSchema>> {
  const profile = payload.profile;
  const missing = [
    !profile?.adoOrgUrl ? "Azure DevOps organization URL" : "",
    !profile?.adoProject ? "ADO project" : "",
    !profile?.adoRepoName ? "ADO repository" : "",
  ].filter(Boolean);
  if (missing.length > 0 || !profile) {
    throw new Error(`Project Link is missing ${missing.join(", ") || "Azure DevOps details"} before PR workflow actions can run.`);
  }
  return profile;
}

function adoPipelineProfileFromWorkflowPayload(payload: z.infer<typeof ChatWorkflowActionSchema>): NonNullable<z.infer<typeof InlineProfileSchema>> {
  const profile = payload.profile;
  const missing = [
    !profile?.adoOrgUrl ? "Azure DevOps organization URL" : "",
    !profile?.adoProject ? "ADO project" : "",
  ].filter(Boolean);
  if (missing.length > 0 || !profile) {
    throw new Error(`Project Link is missing ${missing.join(", ") || "Azure DevOps details"} before pipeline workflow actions can run.`);
  }
  return profile;
}

function pipelineIdFromWorkflowPayload(
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  profile: NonNullable<z.infer<typeof InlineProfileSchema>>,
): number {
  const pipelineId = Number(payload.pipelineId ?? profile.adoPipelineId ?? 0);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
    throw new Error("Project Link is missing Azure DevOps pipeline ID before pipeline workflow actions can run.");
  }
  return pipelineId;
}

async function resolveWorkflowPullRequestId(
  profile: NonNullable<z.infer<typeof InlineProfileSchema>>,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
  explicitPullRequestId?: number,
): Promise<number> {
  if (explicitPullRequestId) return explicitPullRequestId;
  const pullRequests = await listAzurePullRequests({
    organization: profile.adoOrgUrl,
    project: profile.adoProject,
    repository: profile.adoRepoName,
    auth,
    status: "active",
    top: 1,
  });
  const latest = pullRequests[0]?.id ?? 0;
  if (!latest) throw new Error("No active pull request was found for this Project Link. Select or provide a pull request ID.");
  return latest;
}

function adoWorkflowTool(name: string, result: unknown) {
  return {
    name,
    command: `internal ${name}`,
    ok: true,
    stdout: JSON.stringify(result),
    stderr: "",
    returncode: 0,
  };
}

function adoWorkflowDoneResult(args: {
  action: z.infer<typeof ChatWorkflowActionSchema>["action"];
  repoPath: string;
  sessionId?: string;
  workflowKind?: "pr" | "ci";
  phase: string;
  currentStep: string;
  summary: string;
  tools: Array<ReturnType<typeof adoWorkflowTool>>;
  artifacts?: WorkflowActionArtifact[];
}) {
  return {
    ok: true,
    action: args.action,
    repoPath: args.repoPath,
    sessionId: args.sessionId,
    summary: args.summary,
    workflowState: {
      status: "done" as const,
      currentStep: args.currentStep,
      completedTools: args.tools.map((tool) => tool.name),
      workflowKind: args.workflowKind ?? "pr" as const,
      workflowPhase: args.phase,
    },
    tools: args.tools,
    artifacts: args.artifacts,
  };
}

async function appendWorkflowActionAssistantBubble(
  chatSessions: ChatSessionManager,
  sessionId: string | undefined,
  content: string,
  artifacts: WorkflowActionArtifact[] | undefined,
): Promise<void> {
  if (!sessionId) return;
  await chatSessions.appendBubble(sessionId, {
    role: "assistant",
    content,
    timestamp: Math.floor(Date.now() / 1000),
    artifacts: artifacts?.length ? artifacts : undefined,
  });
}

function summarizePolicies(pullRequestId: number, policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>): string {
  if (policies.length === 0) return `PR #${pullRequestId} has no policy evaluations returned by Azure DevOps.`;
  const blocking = policies.filter((policy) => policy.isBlocking);
  const failed = policies.filter((policy) => /failed|rejected|error/i.test(policy.status));
  const pending = policies.filter((policy) => /queued|running|pending|notstarted/i.test(policy.status));
  return [
    `PR #${pullRequestId} policy status: ${policies.length} evaluation(s).`,
    `${blocking.length} blocking, ${failed.length} failed/error, ${pending.length} pending/running.`,
    ...policies.slice(0, 8).map((policy) =>
      `- ${policy.displayName || policy.typeName || policy.configurationId}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`,
    ),
  ].join("\n");
}

function summarizeWorkItems(pullRequestId: number, workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>): string {
  if (workItems.length === 0) return `PR #${pullRequestId} has no linked work items.`;
  return [
    `PR #${pullRequestId} has ${workItems.length} linked work item(s).`,
    ...workItems.slice(0, 10).map((item) =>
      `- #${item.id} ${item.type}${item.state ? ` [${item.state}]` : ""}: ${item.title}`,
    ),
  ].join("\n");
}

function summarizePipelineRuns(pipelineId: number, runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>): string {
  if (runs.length === 0) return `Pipeline #${pipelineId} has no recent runs returned by Azure DevOps.`;
  const latest = runs[0]!;
  const failed = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  return [
    `Pipeline #${pipelineId} latest run #${latest.id || "unknown"} ${latest.name || ""}: ${latest.state || "unknown"}${latest.result ? `/${latest.result}` : ""}.`,
    `Recent runs: ${runs.length}. Failed or canceled: ${failed.length}.`,
    ...runs.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${run.name || "run"} ${run.sourceBranch || "unknown branch"}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${run.url})` : ""}`,
    ),
  ].join("\n");
}

async function pipelineFailureTimeline(
  profile: NonNullable<z.infer<typeof InlineProfileSchema>>,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
): Promise<{
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>;
  logExcerpts?: Array<Awaited<ReturnType<typeof getAzureBuildLogExcerpt>>>;
  error?: string;
}> {
  const failedRun = runs.find((run) => run.id && /failed|canceled/i.test(`${run.result} ${run.state}`));
  if (!failedRun) return {};
  try {
    const timeline = await getAzureBuildTimeline({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      buildId: failedRun.id,
      auth,
    });
    const logExcerpts = await pipelineFailureLogExcerpts(profile, timeline, auth);
    return { timeline, logExcerpts };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

type PipelineLogExcerpt = Awaited<ReturnType<typeof getAzureBuildLogExcerpt>>;

async function pipelineFailureLogExcerpts(
  profile: NonNullable<z.infer<typeof InlineProfileSchema>>,
  timeline: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
): Promise<PipelineLogExcerpt[]> {
  const logIds = [...new Set(timeline.failedRecords.map((record) => record.logId).filter((id) => id > 0))].slice(0, 3);
  if (logIds.length === 0) return [];
  const results = await Promise.all(logIds.map(async (logId): Promise<PipelineLogExcerpt | undefined> => {
    try {
      return await getAzureBuildLogExcerpt({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        buildId: timeline.buildId,
        logId,
        auth,
      });
    } catch {
      return undefined;
    }
  }));
  return results.filter((item): item is PipelineLogExcerpt => Boolean(item));
}

function pipelineFailureArtifacts(
  pipelineId: number,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  logExcerpts?: PipelineLogExcerpt[],
  timelineError?: string,
): WorkflowActionArtifact[] {
  const failedRuns = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  if (failedRuns.length === 0) return [];
  const latest = failedRuns[0]!;
  const runId = latest.id || "unknown";
  const status = `${latest.state || "unknown"}${latest.result ? `/${latest.result}` : ""}`;
  const artifactId = `pipeline-${pipelineId}-run-${runId}-failed`;
  const failedRecordLines = (timeline?.failedRecords ?? []).slice(0, 8).map((record) => {
    const issue = record.issues.find((item) => /error/i.test(item.type)) ?? record.issues[0];
    const issueText = issue?.message ? ` - ${compactInlineText(issue.message, 180)}` : "";
    return `- ${record.name || record.id || "record"} (${record.type || "unknown"}): ${record.state || "unknown"}${record.result ? `/${record.result}` : ""}${issueText}`;
  });
  const errorIssueLines = (timeline?.errorIssues ?? []).slice(0, 8).map((issue) =>
    `- ${issue.category || issue.type || "error"}: ${compactInlineText(issue.message || "No message returned.", 220)}`,
  );
  const logExcerptLines = (logExcerpts ?? []).slice(0, 3).flatMap((log) => [
    `### Log #${log.logId} lines ${log.startLine}-${log.endLine}${log.truncated ? " (excerpt)" : ""}`,
    "",
    "```text",
    log.excerpt || "(empty log excerpt)",
    "```",
    "",
  ]);
  const lines = [
    `# Pipeline #${pipelineId} failure`,
    "",
    `Latest failed/canceled run: #${runId}${latest.name ? ` ${latest.name}` : ""}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Pipeline | #${pipelineId} |`,
    `| Run | #${runId} |`,
    `| Branch | ${latest.sourceBranch || "unknown"} |`,
    `| Status | ${status} |`,
    `| Created | ${latest.createdDate || "unknown"} |`,
    `| Finished | ${latest.finishedDate || "unknown"} |`,
    `| URL | ${latest.url || "not returned"} |`,
    "",
    "## Recent failed or canceled runs",
    "",
    ...failedRuns.slice(0, 5).map((run) =>
      `- #${run.id || "unknown"} ${run.name || "run"} ${run.sourceBranch || "unknown branch"}: ${run.state || "unknown"}${run.result ? `/${run.result}` : ""}${run.url ? ` (${run.url})` : ""}`,
    ),
    "",
    "## Failed timeline records",
    "",
    ...(failedRecordLines.length > 0
      ? failedRecordLines
      : [timelineError
          ? `- Timeline unavailable: ${compactInlineText(timelineError, 220)}`
          : "- No failed timeline records were returned."]
    ),
    "",
    "## Error issues",
    "",
    ...(errorIssueLines.length > 0
      ? errorIssueLines
      : [timelineError
          ? "- Error issue details were not available because the timeline request failed."
          : "- No timeline error issues were returned."]
    ),
    "",
    "## Log excerpts",
    "",
    ...(logExcerptLines.length > 0
      ? logExcerptLines
      : [timeline?.failedRecords?.some((record) => record.logId)
          ? "- Failed task logs were not available."
          : "- No failed timeline record returned a log ID."]
    ),
    "",
    "## Recovery guidance",
    "",
    "- Treat this as remote CI/CD evidence, not a local validation failure.",
    "- Inspect run logs or task details before proposing code changes.",
    "- If the failure is transient or infra-related, prepare a pipeline rerun approval instead of changing code.",
    "- If the failure matches local tests/builds, run the focused local validation command before committing.",
    "",
    "Candidate next actions:",
    "",
    "- Analyze pipeline failure",
    "- Trigger pipeline rerun",
    "- Run focused local validation",
  ];
  return [{
    type: "artifact",
    artifactId,
    title: `Pipeline #${pipelineId} run #${runId} failure`,
    artifactType: "markdown",
    status: "error",
    content: lines.join("\n"),
  }];
}

function compactInlineText(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatBuildReadinessSignal(build: Awaited<ReturnType<typeof listAzureBuilds>>[number]): string {
  const id = build.id ? `#${build.id}` : "build";
  const buildNumber = build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
  const definition = build.definitionName ? ` ${compactInlineText(build.definitionName, 48)}` : "";
  const result = build.result || build.status || "unknown";
  return `${id}${buildNumber}${definition}: ${result}`;
}

function formatPolicyReadinessSignal(policy: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>[number]): string {
  const name = policy.displayName || policy.typeName || `policy ${policy.configurationId}`;
  return `${compactInlineText(name, 72)}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`;
}

function formatThreadReadinessSignal(thread: Awaited<ReturnType<typeof listAzurePullRequestThreads>>[number]): string {
  const firstComment = thread.comments[0]?.content ? compactInlineText(thread.comments[0].content, 80) : "active discussion";
  return `#${thread.id}: ${firstComment}`;
}

function formatWorkItemReadinessSignal(item: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>[number]): string {
  return `#${item.id} ${item.type}${item.state ? ` [${item.state}]` : ""}: ${compactInlineText(item.title, 80)}`;
}

function buildPrReadinessSignalMetadata(args: {
  builds: Awaited<ReturnType<typeof listAzureBuilds>>;
  policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
  threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
  workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
}) {
  const buildBlockers = args.builds
    .filter((build) => /failed|canceled/i.test(build.result))
    .slice(0, 10)
    .map((build) => ({
      id: build.id,
      buildNumber: build.buildNumber,
      definitionName: build.definitionName,
      status: build.status,
      result: build.result,
      url: build.url,
    }));
  const policyBlockers = args.policies
    .filter((policy) => /failed|rejected|error/i.test(policy.status))
    .slice(0, 10)
    .map((policy) => ({
      id: policy.id,
      name: policy.displayName || policy.typeName || `policy ${policy.configurationId}`,
      typeName: policy.typeName,
      status: policy.status,
      isBlocking: policy.isBlocking,
    }));
  const activeThreads = args.threads
    .filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2")
    .slice(0, 10)
    .map((thread) => ({
      id: thread.id,
      status: thread.status,
      author: thread.comments[0]?.author?.displayName ?? "",
      firstComment: compactInlineText(thread.comments[0]?.content ?? "", 160),
    }));
  const linkedWorkItems = args.workItems
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      state: item.state,
      url: item.url,
    }));
  return {
    failedPolicyCount: policyBlockers.length,
    buildBlockers,
    policyBlockers,
    activeThreads,
    linkedWorkItems,
  };
}

function buildWorkflowPrInsight(args: {
  pullRequest: Awaited<ReturnType<typeof getAzurePullRequestById>>;
  threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
  changes: Awaited<ReturnType<typeof listAzurePullRequestChanges>>;
  builds: Awaited<ReturnType<typeof listAzureBuilds>>;
  workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
  policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
}) {
  const failedBuilds = args.builds.filter((build) => /failed|canceled/i.test(build.result));
  const activeThreads = args.threads.filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2");
  const failedPolicies = args.policies.filter((policy) => /failed|rejected|error/i.test(policy.status));
  const pendingPolicies = args.policies.filter((policy) => /queued|running|pending|notstarted/i.test(policy.status));
  const changedPaths = args.changes.changes
    .map((change) => change.path || change.originalPath)
    .filter(Boolean);
  const readiness =
    failedBuilds.length > 0 || failedPolicies.some((policy) => policy.isBlocking)
      ? "blocked"
      : activeThreads.length > 0 || pendingPolicies.length > 0
        ? "needs attention"
        : "ready";
  const lines = [
    `PR #${args.pullRequest.id}: ${args.pullRequest.title}`,
    `Readiness: ${readiness}. ${args.changes.fileCount} changed file(s), ${activeThreads.length} active thread(s), ${failedBuilds.length} failed/canceled build(s), ${failedPolicies.length} failed/error policy evaluation(s), ${args.workItems.length} linked work item(s).`,
  ];
  if (changedPaths.length > 0) {
    lines.push(`Touched areas: ${changedPaths.slice(0, 10).join(", ")}${changedPaths.length > 10 ? ", ..." : ""}.`);
  }
  if (failedBuilds.length > 0) {
    lines.push(`Blocking builds: ${failedBuilds.slice(0, 5).map(formatBuildReadinessSignal).join("; ")}.`);
  }
  if (failedPolicies.length > 0) {
    lines.push(`Policy blockers: ${failedPolicies.slice(0, 5).map(formatPolicyReadinessSignal).join("; ")}.`);
  }
  if (activeThreads.length > 0) {
    lines.push(`Active threads: ${activeThreads.slice(0, 5).map(formatThreadReadinessSignal).join("; ")}.`);
  }
  if (args.workItems.length > 0) {
    lines.push(`Linked work items: ${args.workItems.slice(0, 5).map(formatWorkItemReadinessSignal).join("; ")}.`);
  }
  if (!args.pullRequest.description.trim()) lines.push("Risk signal: PR description is empty.");
  if (args.workItems.length === 0) lines.push("Info: no linked work items were found.");
  if (pendingPolicies.length > 0) lines.push(`Waiting: ${pendingPolicies.length} policy evaluation(s) are pending/running.`);
  return { readiness, summary: lines.join("\n") };
}

function buildWorkspaceWorkflowProposal(
  action: z.infer<typeof ChatWorkflowActionSchema>["action"],
  payload: z.infer<typeof ChatWorkflowActionSchema>,
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
    const recovery = GIT_RECOVERY_ACTIONS[action];
    if (operationState?.phase !== recovery.phase) {
      throw new Error(`No in-progress ${gitOperationPhaseLabel(recovery.phase)} was detected for this repository.`);
    }
    const conflictSuffix = operationState.status === "conflicted"
      ? ` ${operationState.summary}`
      : "";
    return {
      tool: recovery.tool,
      args: { action: recovery.gitAction },
      description: `${recovery.label}.${conflictSuffix}`,
      nextHint: recovery.gitAction === "continue" ? "inspect branch status" : "inspect workspace state",
      workflow: {
        kind: "git",
        phase: action,
        branch: branch || undefined,
      },
    };
  }
  if (action === "stage_resolved_conflicts") {
    if (!operationState || operationState.status !== "conflicted" || operationState.conflictFiles.length === 0) {
      throw new Error("No unresolved conflict files were detected for this repository.");
    }
    const paths = (payload.paths ?? []).map((item) => String(item).trim()).filter(Boolean);
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
        branch: branch || undefined,
        message: operationState.phase,
      },
    };
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

async function preflightFromTools(
  chatSessions: ChatSessionManager,
  action: z.infer<typeof ChatWorkflowActionSchema>["action"],
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  tools: Array<Awaited<ReturnType<typeof runGitProbe>> & { name: string }>,
  statusText: string,
): Promise<PendingToolAction["preflight"] | undefined> {
  if (action === "checkout_branch" || action === "create_branch") return branchPreflightFromTools(action, payload, tools);
  if (action === "create_pr") {
    const currentBranch = tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() ?? "";
    const latestSubject = tools.find((tool) => tool.name === "git_log_subject" && tool.ok)?.stdout.trim() ?? "";
    return prPreflightFromPayload(payload, currentBranch, statusText, latestSubject);
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

function changedFilesFromGitOutputs(diffNameOnly: string, statusText: string): string[] {
  const files = new Set<string>();
  for (const line of diffNameOnly.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }
  for (const line of statusText.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("## ")) continue;
    const rawPath = trimmed.slice(3).trim();
    if (!rawPath) continue;
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
    files.add(path.replace(/^"|"$/g, ""));
  }
  return Array.from(files);
}

interface DerivedValidationCommand {
  command: string;
  sourceSummary: string;
  selectedScript: string;
  packageFilters: string[];
  packageRoots: string[];
}

interface ValidationPackageCandidate {
  packageRoot: string;
  relativePackageRoot: string;
  packageName: string;
  script: string;
}

function deriveValidationCommand(repoPath: string, kind: "test" | "build", changedFiles: string[]): DerivedValidationCommand | undefined {
  const packageRoots = Array.from(new Set(
    changedFiles
      .map((file) => nearestPackageRoot(repoPath, file))
      .filter((root): root is string => Boolean(root)),
  ));
  if (packageRoots.length === 0) return undefined;

  const rootHasPnpm = nodeFs.existsSync(nodePath.join(repoPath, "pnpm-workspace.yaml")) ||
    nodeFs.existsSync(nodePath.join(repoPath, "pnpm-lock.yaml"));
  const hasPnpmWrapper = nodeFs.existsSync(nodePath.join(repoPath, "scripts", "windows", "pnpm-project.ps1"));
  const candidates = packageRoots
    .map((packageRoot) => validationPackageCandidate(repoPath, kind, packageRoot))
    .filter((candidate): candidate is ValidationPackageCandidate => Boolean(candidate));
  if (candidates.length !== packageRoots.length) return undefined;
  if (candidates.length > 1) {
    const script = commonScriptName(candidates);
    const packageNames = candidates.map((candidate) => candidate.packageName).filter(Boolean);
    if (!script || packageNames.length !== candidates.length || !rootHasPnpm || !hasPnpmWrapper) return undefined;
    const filters = packageNames.flatMap((packageName) => ["--filter", packageName]);
    return {
      command: `.\\scripts\\windows\\pnpm-project.ps1 ${filters.join(" ")} ${script === "test" || script === "build" ? script : `run ${script}`}`,
      sourceSummary: `derived from ${candidates.length} changed packages using script ${script}`,
      selectedScript: script,
      packageFilters: packageNames,
      packageRoots: candidates.map((candidate) => candidate.relativePackageRoot),
    };
  }

  const candidate = candidates[0]!;
  const { packageRoot, relativePackageRoot, packageName, script } = candidate;

  if (packageRoot === repoPath) {
    if (hasPnpmWrapper) {
      return {
        command: `.\\scripts\\windows\\pnpm-project.ps1 ${script === "test" || script === "build" ? script : `run ${script}`}`,
        sourceSummary: `derived from root package.json script ${script}`,
        selectedScript: script,
        packageFilters: [],
        packageRoots: ["."],
      };
    }
    return {
      command: `npm run ${script}`,
      sourceSummary: `derived from root package.json script ${script}`,
      selectedScript: script,
      packageFilters: [],
      packageRoots: ["."],
    };
  }

  if (rootHasPnpm && packageName && hasPnpmWrapper) {
    return {
      command: `.\\scripts\\windows\\pnpm-project.ps1 --filter ${packageName} ${script === "test" || script === "build" ? script : `run ${script}`}`,
      sourceSummary: `derived from ${relativePackageRoot}/package.json script ${script}`,
      selectedScript: script,
      packageFilters: [packageName],
      packageRoots: [relativePackageRoot],
    };
  }

  return {
    command: `npm --prefix ${relativePackageRoot} run ${script}`,
    sourceSummary: `derived from ${relativePackageRoot}/package.json script ${script}`,
    selectedScript: script,
    packageFilters: [],
    packageRoots: [relativePackageRoot],
  };
}

function validationPackageCandidate(
  repoPath: string,
  kind: "test" | "build",
  packageRoot: string,
): ValidationPackageCandidate | undefined {
  const packageJson = readPackageJson(packageRoot);
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object"
    ? packageJson.scripts as Record<string, unknown>
    : {};
  const script = selectValidationScriptName(kind, scripts);
  if (!script) return undefined;
  const packageName = typeof packageJson?.name === "string" && packageJson.name.trim()
    ? packageJson.name.trim()
    : "";
  return {
    packageRoot,
    relativePackageRoot: normalizeRelativePath(nodePath.relative(repoPath, packageRoot)),
    packageName,
    script,
  };
}

function commonScriptName(candidates: ValidationPackageCandidate[]): string {
  const [first] = candidates;
  if (!first) return "";
  return candidates.every((candidate) => candidate.script === first.script) ? first.script : "";
}

function nearestPackageRoot(repoPath: string, changedFile: string): string | undefined {
  const absoluteFile = nodePath.resolve(repoPath, changedFile);
  let current = nodeFs.existsSync(absoluteFile) && nodeFs.statSync(absoluteFile).isDirectory()
    ? absoluteFile
    : nodePath.dirname(absoluteFile);
  const root = nodePath.resolve(repoPath);
  while (current.startsWith(root)) {
    if (nodeFs.existsSync(nodePath.join(current, "package.json"))) return current;
    if (current === root) break;
    current = nodePath.dirname(current);
  }
  return undefined;
}

function readPackageJson(packageRoot: string): Record<string, unknown> | undefined {
  try {
    const raw = nodeFs.readFileSync(nodePath.join(packageRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function selectValidationScriptName(kind: "test" | "build", scripts: Record<string, unknown>): string {
  const candidates = kind === "build"
    ? ["build"]
    : ["test", "test:unit", "vitest"];
  return candidates.find((name) => typeof scripts[name] === "string" && String(scripts[name]).trim()) ?? "";
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function focusedValidationPreflightFromSession(
  chatSessions: ChatSessionManager,
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  kind: "test" | "build",
  changedFiles: string[],
): Promise<ValidationPreflight | undefined> {
  if (!payload.sessionId) return undefined;
  const bubbles = await chatSessions.getBubbles(payload.sessionId).catch(() => []);
  const artifact = [...bubbles]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((item) =>
      item.status === "error" &&
      item.artifactType === "markdown" &&
      item.artifactId.startsWith(`validation-${kind}-failed-`)
    );
  const command = extractValidationCandidateRerunCommand(artifact?.content ?? "");
  if (!command) return undefined;
  const changedSummary = changedFiles.length > 0
    ? ` Changed files considered: ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? ", ..." : ""}.`
    : " No unstaged working-tree file list was detected.";
  return {
    kind: "validation",
    status: "ready",
    validationKind: kind,
    command,
    commandSource: "artifact",
    changedFiles: changedFiles.slice(0, 20),
    changedFileCount: changedFiles.length,
    selectionReason: `selected from the latest ${kind} failure artifact candidate rerun`,
    summary: `Validation command selected from latest ${kind} failure artifact: ${command}. Focused rerun candidate from previous validation failure.${changedSummary}`,
  };
}

function extractValidationCandidateRerunCommand(content: string): string {
  const line = content
    .split(/\r?\n/)
    .find((entry) => /^-\s*Candidate rerun:/i.test(entry.trim()));
  if (!line) return "";
  const code = line.match(/`([^`]+)`/);
  if (code?.[1]?.trim()) return code[1].trim();
  return line.replace(/^-\s*Candidate rerun:\s*/i, "").split(",")[0]?.trim() ?? "";
}

function validationPreflightFromPayload(
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  kind: "test" | "build",
  changedFiles: string[],
): ValidationPreflight {
  const override = String(payload.validationScript ?? "").trim();
  const configured = String(kind === "build" ? payload.profile?.buildCommand ?? "" : payload.profile?.testCommand ?? "").trim();
  const derived = !override && !configured
    ? deriveValidationCommand(payload.repoPath, kind, changedFiles)
    : undefined;
  const fallback = kind === "build" ? "npm run build" : "npm test";
  const command = override || configured || derived?.command || fallback;
  const commandSource = override ? "override" : configured ? "profile" : derived ? "derived" : "default";
  const status = commandSource === "default" ? "default_command" : "ready";
  const fileSummary = changedFiles.length > 0
    ? ` Changed files considered: ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? ", ..." : ""}.`
    : " No unstaged working-tree file list was detected; using command-level validation.";
  const sourceSummary = derived?.sourceSummary ? ` ${derived.sourceSummary}.` : "";
  const selectionReason = derived?.sourceSummary
    ?? (override ? "selected from the explicit validation override"
      : configured ? "selected from the Project Link validation command"
        : "selected from the default validation command");
  return {
    kind: "validation",
    status,
    validationKind: kind,
    command,
    commandSource,
    changedFiles: changedFiles.slice(0, 20),
    changedFileCount: changedFiles.length,
    selectedScript: derived?.selectedScript,
    packageFilters: derived?.packageFilters,
    packageRoots: derived?.packageRoots,
    selectionReason,
    summary: `Validation command selected from ${commandSource}: ${command}.${sourceSummary}${fileSummary}`,
  };
}

function branchPreflightFromTools(
  action: "checkout_branch" | "create_branch",
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  tools: Array<Awaited<ReturnType<typeof runGitProbe>> & { name: string }>,
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

function prPreflightFromPayload(
  payload: z.infer<typeof ChatWorkflowActionSchema>,
  currentBranch: string,
  statusText: string,
  latestSubject: string,
): PrPreflight {
  const profile = payload.profile;
  const organization = String(profile?.adoOrgUrl ?? "").trim();
  const project = String(profile?.adoProject ?? "").trim();
  const repository = String(profile?.adoRepoName ?? "").trim();
  const sourceBranch = normalizeBranchName(String(payload.branch ?? currentBranch ?? "").trim());
  const targetBranch = normalizeBranchName(String(payload.targetBranch ?? profile?.targetBranch ?? profile?.defaultBranch ?? "main").trim()) || "main";
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

function normalizeBranchName(branch: string): string {
  return branch
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "")
    .replace(/^remotes\//, "")
    .replace(/^origin\//, "");
}

function pushReadinessFromTools(
  tools: Array<Awaited<ReturnType<typeof runGitProbe>> & { name: string }>,
): PendingToolAction["readiness"] | undefined {
  const upstreamProbe = tools.find((tool) => tool.name === "git_upstream");
  if (!upstreamProbe) return undefined;
  const upstream = upstreamProbe.ok ? upstreamProbe.stdout.trim() : "";
  if (!upstream) {
    return {
      kind: "push",
      status: "no_upstream",
      summary: "No upstream branch is configured; this push will set upstream on origin.",
    };
  }

  const divergenceProbe = tools.find((tool) => tool.name === "git_divergence");
  if (!divergenceProbe?.ok) {
    return {
      kind: "push",
      status: "unknown",
      upstream,
      summary: `Upstream is ${upstream}, but ahead/behind status could not be determined.`,
    };
  }
  const [behindRaw, aheadRaw] = divergenceProbe.stdout.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "0", 10) || 0;
  const ahead = Number.parseInt(aheadRaw ?? "0", 10) || 0;
  const status =
    behind > 0 && ahead > 0 ? "diverged"
      : behind > 0 ? "behind"
        : ahead > 0 ? "ahead"
          : "up_to_date";
  const summary =
    status === "diverged"
      ? `Branch has diverged from ${upstream}: ahead ${ahead}, behind ${behind}. Consider pull/rebase before pushing.`
      : status === "behind"
        ? `Branch is behind ${upstream} by ${behind} commit${behind === 1 ? "" : "s"}. Push may fail until you pull or rebase.`
        : status === "ahead"
          ? `Branch is ahead of ${upstream} by ${ahead} commit${ahead === 1 ? "" : "s"}.`
          : `Branch is up to date with ${upstream}.`;
  return {
    kind: "push",
    status,
    upstream,
    ahead,
    behind,
    summary,
  };
}

type GitOperationPhase = "normal" | "rebase" | "merge" | "cherry_pick" | "revert";

interface GitOperationState {
  status: "normal" | "in_progress" | "conflicted";
  phase: GitOperationPhase;
  conflictFiles: string[];
  summary: string;
}

function gitOperationStateFromTools(
  repoPath: string,
  statusText: string,
  tools: Array<Awaited<ReturnType<typeof runGitProbe>> & { name: string }>,
): GitOperationState {
  const conflictFiles = conflictFilesFromStatus(statusText);
  const gitDirProbe = tools.find((tool) => tool.name === "git_dir" && tool.ok);
  const gitDir = resolveGitDir(repoPath, gitDirProbe?.stdout ?? "");
  const phase = gitDir ? gitOperationPhaseFromGitDir(gitDir) : "normal";
  const phaseLabel = gitOperationPhaseLabel(phase);

  if (conflictFiles.length > 0) {
    const prefix = phase === "normal"
      ? "Git has unresolved index conflicts"
      : `Git is in ${phaseLabel} with unresolved conflicts`;
    return {
      status: "conflicted",
      phase,
      conflictFiles,
      summary: `${prefix}: ${conflictFiles.slice(0, 8).join(", ")}${conflictFiles.length > 8 ? ", ..." : ""}.`,
    };
  }

  if (phase !== "normal") {
    return {
      status: "in_progress",
      phase,
      conflictFiles: [],
      summary: `Git has an in-progress ${phaseLabel}. Continue, abort, or skip that operation before starting a different Git workflow.`,
    };
  }

  return {
    status: "normal",
    phase: "normal",
    conflictFiles: [],
    summary: "No merge, rebase, cherry-pick, or revert operation is in progress.",
  };
}

function resolveGitDir(repoPath: string, rawGitDir: string): string {
  const gitDir = rawGitDir.trim();
  if (!gitDir) return "";
  return nodePath.isAbsolute(gitDir) ? gitDir : nodePath.resolve(repoPath, gitDir);
}

function gitOperationPhaseFromGitDir(gitDir: string): GitOperationPhase {
  if (nodeFs.existsSync(nodePath.join(gitDir, "rebase-merge")) || nodeFs.existsSync(nodePath.join(gitDir, "rebase-apply"))) return "rebase";
  if (nodeFs.existsSync(nodePath.join(gitDir, "MERGE_HEAD"))) return "merge";
  if (nodeFs.existsSync(nodePath.join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry_pick";
  if (nodeFs.existsSync(nodePath.join(gitDir, "REVERT_HEAD"))) return "revert";
  return "normal";
}

function conflictFilesFromStatus(statusText: string): string[] {
  const unmergedCodes = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  return statusText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("## "))
    .filter((line) => unmergedCodes.has(line.slice(0, 2)))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function gitOperationPhaseLabel(phase: GitOperationPhase): string {
  if (phase === "cherry_pick") return "cherry-pick";
  return phase;
}

function gitOperationBlockForAction(
  action: z.infer<typeof ChatWorkflowActionSchema>["action"],
  state: GitOperationState,
): { workflowPhase: string; summary: string } | undefined {
  if (state.status === "normal") return undefined;
  if (action === "inspect_environment" || action === "inspect_changes" || action === "refresh_branch") return undefined;
  if (!["checkout_branch", "create_branch", "push_branch", "prepare_commit", "create_pr"].includes(action)) return undefined;

  const phase = state.phase === "normal" ? "git" : gitOperationPhaseLabel(state.phase);
  const workflowPhase = state.status === "conflicted"
    ? `${state.phase === "normal" ? "git" : state.phase}_conflict`
    : `${state.phase}_in_progress`;
  const recovery =
    state.phase === "rebase"
      ? "Resolve conflicts, stage only the resolved conflict files, then continue/abort/skip the rebase."
      : state.phase === "merge"
        ? "Resolve conflicts, stage only the resolved conflict files, then finish or abort the merge."
        : `Finish or abort the ${phase} operation before starting another Git workflow.`;
  return {
    workflowPhase,
    summary: `${state.summary} ${recovery}`,
  };
}

function dirtyWorkingTreeSummary(statusText: string): string {
  const changes = statusText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("## "));
  if (changes.length === 0) return "";
  return `Working tree has ${changes.length} pending change${changes.length === 1 ? "" : "s"}; Git may block the operation or carry changes into the target branch.`;
}

function workflowRiskForAction(
  action: z.infer<typeof ChatWorkflowActionSchema>["action"],
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

function summarizeWorkspaceWorkflow(action: string, args: {
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

function envSourceLabel(): string {
  return activeEnvFile ?? "process environment";
}

function azureDeploymentProbeKey(settings: Settings): string {
  return [
    settings.azureOpenAiEndpoint,
    settings.azureOpenAiApiVersion,
    settings.azureOpenAiChatDeployment,
    settings.azureOpenAiApiKey ? settings.azureOpenAiApiKey.slice(0, 8) : "",
  ].join("|");
}

async function probeAzureDeployment(settings: Settings): Promise<{ available: boolean; error: string }> {
  if (settings.llmProvider !== "azure") return { available: false, error: "" };
  if (!settings.azureOpenAiEndpoint || !settings.azureOpenAiApiKey || !settings.azureOpenAiChatDeployment) {
    return { available: false, error: "Azure OpenAI endpoint, key, or chat deployment is missing." };
  }

  const key = azureDeploymentProbeKey(settings);
  const now = Date.now();
  if (azureDeploymentProbeCache?.key === key && now - azureDeploymentProbeCache.checkedAt < 30_000) {
    return {
      available: azureDeploymentProbeCache.available,
      error: azureDeploymentProbeCache.error,
    };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  try {
    const endpoint = settings.azureOpenAiEndpoint.replace(/\/+$/, "");
    const deployment = encodeURIComponent(settings.azureOpenAiChatDeployment);
    const apiVersion = encodeURIComponent(settings.azureOpenAiApiVersion);
    const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      method: "POST",
      headers: {
        "api-key": settings.azureOpenAiApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Reply with ok." },
          { role: "user", content: "health" },
        ],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    const body = response.ok ? "" : (await response.text()).trim();
    const error = response.ok
      ? ""
      : response.status === 404
        ? "Azure OpenAI deployment was not found on this resource."
        : body || `Azure OpenAI deployment check failed with HTTP ${response.status}.`;
    const result = { available: response.ok, error };
    azureDeploymentProbeCache = { key, checkedAt: now, ...result };
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const result = { available: false, error };
    azureDeploymentProbeCache = { key, checkedAt: now, ...result };
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function explainChatSseError(err: unknown, settings: Settings): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/deployment.*does not exist|deployment.*not found/i.test(message)) {
    return [
      "Azure OpenAI deployment not found.",
      `Daemon env source: ${envSourceLabel()}.`,
      `Deployment: ${settings.azureOpenAiChatDeployment || "(missing)"}.`,
      "Open Settings and set the chat deployment to an existing Azure OpenAI deployment, then restart the daemon.",
    ].join(" ");
  }
  return message;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const settings = getSettings();
  const app = Fastify({
    logger: { level: settings.runtimeLogLevel.toLowerCase() },
  });

  // Lazy store getters — re-evaluated on every request so hot-reloaded settings
  // (after /daemon/configure) are always reflected without a daemon restart.
  let _tableCache: { url: string; store: AzureTableProfileStore } | null = null;
  const getTableStore = (): AzureTableProfileStore | null => {
    const url = settings.azureStorageAccount;
    if (!url) return null;
    if (_tableCache?.url !== url) _tableCache = { url, store: new AzureTableProfileStore(url) };
    return _tableCache.store;
  };

  let _kvCache: { url: string; kv: KeyVaultSecrets } | null = null;
  const getKvSecrets = (): KeyVaultSecrets | null => {
    const url = settings.azureKeyVaultUrl;
    if (!url) return null;
    if (_kvCache?.url !== url) _kvCache = { url, kv: new KeyVaultSecrets(url) };
    return _kvCache.kv;
  };

  // If AOAI key was stored as a KV sentinel on a previous Apply, resolve it now
  // so LLM calls work without a restart.
  if (
    settings.azureKeyVaultUrl &&
    (process.env["AZURE_OPENAI_API_KEY"] ?? "").startsWith("kv://")
  ) {
    try {
      const kv = new KeyVaultSecrets(settings.azureKeyVaultUrl);
      const key = await kv.getAoaiKey();
      if (key) process.env["AZURE_OPENAI_API_KEY"] = key;
    } catch {
      // Non-fatal: if KV is unreachable at startup, leave the sentinel and retry next request
    }
  }

  // Allow cross-origin requests from the Tauri/Vite frontend
  app.addHook("onSend", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");
  });
  app.options("*", async (_req, reply) => reply.code(204).send());

  // Global Azure auth error handler: map 401/403 from Azure SDK into a structured
  // response the frontend can distinguish from generic server errors.
  app.setErrorHandler(async (error, _req, reply) => {
    const status = (error as { statusCode?: number }).statusCode
      ?? (error as { status?: number }).status;
    if (isAzureAuthenticationRequiredError(error) || status === 401 || status === 403) {
      return reply.code(401).send({
        error: "azure_auth_required",
        message: "Azure credential expired or missing. Please sign in again.",
      });
    }
    // Re-throw non-auth errors for Fastify's default handler
    reply.code(500).send({ error: error.message ?? "internal error" });
  });

  const queue = new TaskQueue(opts.runner ?? runPipelineTask);
  queue.start();
  const chatSessions = new ChatSessionManager();
  const startedAt = Date.now();

  app.addHook("onClose", async () => {
    await queue.stop();
  });

  app.get("/healthz", async () => {
    const azureDeployment = await probeAzureDeployment(settings);
    return {
      ok: true,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: (Date.now() - startedAt) / 1000,
      llmConfigured: settings.llmConfigured,
      llmProvider: settings.llmProvider,
      envSource: envSourceLabel(),
      azureDeployment: settings.azureOpenAiChatDeployment,
      azureApiVersion: settings.azureOpenAiApiVersion,
      azureEndpoint: settings.azureOpenAiEndpoint,
      azureDeploymentAvailable: azureDeployment.available,
      azureDeploymentError: azureDeployment.error,
      // Read live settings values so Apply in the UI is reflected immediately
      cloudProfileStore: !!(settings.azureStorageAccount),
      cloudSecrets:      !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };
  });

  // ── /auth/status — instant cached user (no Azure round-trip) ────────────────
  app.get("/auth/status", async () => {
    const azureAuthConfig = getDesktopAzureAuthConfig();
    const cached = loadPersistedUser(settings.dataDir);
    if (cached && cached.oid !== "anonymous") {
      return {
        authenticated: true,
        oid: cached.oid,
        homeAccountId: cached.homeAccountId,
        tenantId: cached.tenantId,
        username: cached.username,
        upn: cached.upn,
        name: cached.name,
        avatarDataUrl: cached.avatarDataUrl,
        fromCache: true,
        azureAuthConfig,
      };
    }
    return { authenticated: false, fromCache: true, azureAuthConfig };
  });

  // ── /auth/me — resolve live Azure user identity and persist result ───────────
  app.get("/auth/me", async (_req, reply) => {
    const available = await isAzureAuthAvailable();
    if (!available) {
      return reply.code(200).send({
        authenticated: false,
        message: "No Azure credential found. Use the Sign-in button to enable cloud persistence.",
      });
    }
    const user = await getCurrentUser();
    // Persist so /auth/status is instant next time
    persistUserCache(user, settings.dataDir);
    return {
      authenticated: true,
      oid:  user.oid,
      homeAccountId: user.homeAccountId,
      tenantId: user.tenantId,
      username: user.username,
      upn:  user.upn,
      name: user.name,
      avatarDataUrl: user.avatarDataUrl,
      azureAuthConfig: getDesktopAzureAuthConfig(),
    };
  });

  // ── /auth/accounts — recent Microsoft accounts from local MSAL cache ───────
  app.get("/auth/accounts", async () => ({
    accounts: await getCachedAzureAccounts(),
  }));

  // ── /auth/login — native browser flow streamed via SSE ─────────────────────
  app.post("/auth/login", async (req, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const requestedBrowser = (req.body as { browser?: string } | undefined)?.browser;
    const loginHint = (req.body as { loginHint?: string } | undefined)?.loginHint;
    const accountHomeId = (req.body as { accountHomeId?: string } | undefined)?.accountHomeId;
    const browser: BrowserLoginChoice =
      requestedBrowser === "edge" || requestedBrowser === "chrome" || requestedBrowser === "default"
        ? requestedBrowser
        : "default";

    let cancelled = false;
    reply.raw.on("close", () => {
      cancelled = true;
    });

    try {
      if (accountHomeId) {
        send("status", { message: "Signing in..." });
        const cachedUser = await loginWithCachedAccount(accountHomeId);
        if (cachedUser && !cancelled) {
          persistUserCache(cachedUser, settings.dataDir);
          send("done", {
            authenticated: true,
            oid:  cachedUser.oid,
            homeAccountId: cachedUser.homeAccountId,
            tenantId: cachedUser.tenantId,
            username: cachedUser.username,
            upn:  cachedUser.upn,
            name: cachedUser.name,
            avatarDataUrl: cachedUser.avatarDataUrl,
          });
          return;
        }
      }

      send("status", { message: "Preparing Microsoft Entra sign-in..." });
      send("browser", {
        browser,
        message: browser === "default"
          ? "Opening your default browser..."
          : `Opening ${browser === "edge" ? "Microsoft Edge" : "Google Chrome"}...`,
      });
      resetUserCache();
      const user = await loginWithBrowser(browser, { loginHint });

      if (cancelled) return;
      persistUserCache(user, settings.dataDir);
      send("done", {
        authenticated: user.oid !== "anonymous",
        oid:  user.oid,
        homeAccountId: user.homeAccountId,
        tenantId: user.tenantId,
        username: user.username,
        upn:  user.upn,
        name: user.name,
        avatarDataUrl: user.avatarDataUrl,
      });
    } catch (err) {
      if (!cancelled) send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post("/auth/azure-devops/enable", async (req, reply) => {
    const parsed = AuthAzureDevOpsEnableSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const token = await getAzureDevOpsToken({
        interactive: true,
        browser: parsed.data.browser,
        loginHint: parsed.data.loginHint,
        homeAccountId: parsed.data.accountHomeId,
      });
      const user = await getCurrentUser();
      if (user.oid !== "anonymous") persistUserCache(user, settings.dataDir);
      return {
        ok: true,
        authMode: "oauth" as const,
        tokenAvailable: Boolean(token),
        message: "Azure DevOps OAuth consent is available for this signed-in account.",
        user,
      };
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, "oauth");
      return reply.code(401).send({
        ok: false,
        authMode: "oauth" as const,
        authStatus: diagnostic.status,
        authMessage: diagnostic.message,
        retryable: diagnostic.retryable,
      });
    }
  });

  // ── /auth/logout — clear local app identity cache ──────────────────────────
  app.post("/auth/logout", async (_req, reply) => {
    clearPersistedUser(settings.dataDir);
    resetUserCache();
    reply.send({ ok: true });
  });

  // ── /daemon/config — read current non-secret configuration ──────────────────
  // ── /git/branches — list local+remote branches for a given repo path ────────
  app.get("/git/branches", async (req, reply) => {
    const repoPath = (req.query as Record<string, string>)["repoPath"] ?? "";
    if (!repoPath) return reply.code(400).send({ error: "repoPath required" });
    try {
      // runCommand uses the PATH already enriched by injectGitPath() at startup,
      // and never spawns via shell so % characters are never misinterpreted.
      const result = await runCommand(["git", "branch", "-a"], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 8,
      });
      if (result.returncode !== 0) {
        return reply.send({ branches: [], error: result.stderr?.trim() || `git exited ${result.returncode}` });
      }
      const stdout = result.stdout ?? "";
      const branches = stdout
        .split(/\r?\n/)
        .map((l) => {
          // Strip leading "* " (current branch marker) or spaces
          const trimmed = l.replace(/^\*?\s+/, "").trim();
          // Normalise remote tracking refs: "remotes/origin/main" → "main"
          if (trimmed.startsWith("remotes/")) {
            const afterRemotes = trimmed.slice("remotes/".length);
            const slashIdx = afterRemotes.indexOf("/");
            return slashIdx >= 0 ? afterRemotes.slice(slashIdx + 1) : afterRemotes;
          }
          return trimmed;
        })
        .filter((l) => l && !l.includes(" -> "))
        .filter((l, i, arr) => arr.indexOf(l) === i);
      return reply.send({ branches });
    } catch (err) {
      return reply.send({ branches: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── /git/azure-devops-remote — infer ADO fields from local git remotes ──────
  app.get("/git/azure-devops-remote", async (req, reply) => {
    const repoPath = (req.query as Record<string, string>)["repoPath"] ?? "";
    if (!repoPath) return reply.code(400).send({ error: "repoPath required" });
    try {
      const result = await runCommand(["git", "remote", "-v"], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 8,
      });
      if (result.returncode !== 0) {
        return reply.send({ suggestion: null, error: result.stderr?.trim() || `git exited ${result.returncode}` });
      }
      const suggestions = (result.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/))
        .filter((match): match is RegExpMatchArray => !!match)
        .filter((match) => match[3] === "fetch")
        .map((match) => parseAzureDevOpsRemote(match[1] ?? "", match[2] ?? ""))
        .filter((suggestion): suggestion is AzureDevOpsRemoteSuggestion => !!suggestion);
      const origin = suggestions.find((suggestion) => suggestion.remoteName === "origin");
      return reply.send({ suggestion: origin ?? suggestions[0] ?? null });
    } catch (err) {
      return reply.send({ suggestion: null, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Returns everything the Settings UI needs to pre-fill its fields, but never
  // returns API keys, PATs, or other credentials.
  app.get("/daemon/config", async () => ({
    llmProvider:     process.env["LLM_PROVIDER"] === "openai" ? "openai"
                   : process.env["LLM_PROVIDER"] === "azure"  ? "azure"
                   : process.env["AZURE_OPENAI_ENDPOINT"]     ? "azure"
                   : process.env["OPENAI_API_KEY"]            ? "openai"
                   : "",
    azureDeployment:  process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"] ?? process.env["AZURE_OPENAI_DEPLOYMENT"] ?? "",
    azureApiVersion:  process.env["AZURE_OPENAI_API_VERSION"] ?? "",
    azureEndpoint:    process.env["AZURE_OPENAI_ENDPOINT"] ?? "",
    openaiModel:      process.env["OPENAI_MODEL"] ?? "",
    // true when AOAI key is stored in Key Vault (value is a sentinel)
    aoaiKeyInVault:   (process.env["AZURE_OPENAI_API_KEY"] ?? "").startsWith("kv://"),
    // Azure cloud persistence — URLs are not secrets
    azureStorageAccount: settings.azureStorageAccount ?? "",
    azureKeyVaultUrl:    settings.azureKeyVaultUrl ?? "",
    azureCosmosEndpoint: settings.azureCosmosEndpoint ?? "",
    azureTenantId:       getDesktopAzureAuthConfig().tenantId ?? "",
    azureClientId:       getDesktopAzureAuthConfig().clientId ?? "",
    azureAuthUsesDefaultTenant: getDesktopAzureAuthConfig().usesDefaultTenant,
    azureAuthUsesDefaultClient: getDesktopAzureAuthConfig().usesDefaultClient,
    reviewAutoApproveEnabled: settings.reviewAutoApproveEnabled,
    reviewStaleAgeHours: settings.reviewStaleAgeHours,
  }));

  // ── /daemon/configure — persist LLM credentials and hot-reload settings ───
  // The frontend Settings page calls this so credentials survive daemon restarts
  // without users ever touching a .env file.
  const DaemonConfigureSchema = z.object({
    // LLM config
    llmProvider:     z.enum(["azure", "openai"]).optional(),
    azureEndpoint:   z.string().optional(),
    azureApiKey:     z.string().optional(),
    azureDeployment: z.string().optional(),
    azureApiVersion: z.string().optional(),
    openaiApiKey:    z.string().optional(),
    openaiModel:     z.string().optional(),
    // Azure cloud persistence config
    azureStorageAccount: z.string().optional(),
    azureKeyVaultUrl:    z.string().optional(),
    azureCosmosEndpoint: z.string().optional(),
    azureTenantId:       z.string().optional(),
    azureClientId:       z.string().optional(),
    reviewAutoApproveEnabled: z.boolean().optional(),
    reviewStaleAgeHours: z.coerce.number().positive().optional(),
  });

  app.post("/daemon/configure", async (req, reply) => {
    const parsed = DaemonConfigureSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const cfg = parsed.data;
    const envDir = nodePath.join(nodeOs.homedir(), ".cicd-agent");
    const envFile = nodePath.join(envDir, ".env");

    // Build env lines from provided (non-empty) values
    const lines: string[] = [];
    // Determine effective KV URL: either from the payload (new value) or existing settings
    const effectiveKvUrl = cfg.azureKeyVaultUrl ?? settings.azureKeyVaultUrl;

    if (cfg.llmProvider === "azure" || (!cfg.llmProvider && cfg.azureEndpoint)) {
      lines.push("LLM_PROVIDER=azure");
      if (cfg.azureEndpoint)   lines.push(`AZURE_OPENAI_ENDPOINT=${cfg.azureEndpoint}`);
      if (cfg.azureDeployment) lines.push(`AZURE_OPENAI_CHAT_DEPLOYMENT=${cfg.azureDeployment}`);
      if (cfg.azureApiVersion) lines.push(`AZURE_OPENAI_API_VERSION=${cfg.azureApiVersion}`);
      if (cfg.azureApiKey) {
        if (effectiveKvUrl) {
          // Store AOAI key in Key Vault instead of .env for better security
          try {
            const tempKv = new KeyVaultSecrets(effectiveKvUrl);
            await tempKv.setAoaiKey(cfg.azureApiKey);
            lines.push(`AZURE_OPENAI_API_KEY=kv://aoai-key`); // sentinel — key lives in KV
          } catch {
            // KV not ready yet (e.g. first Apply before sign-in) — fall back to .env
            lines.push(`AZURE_OPENAI_API_KEY=${cfg.azureApiKey}`);
          }
        } else {
          lines.push(`AZURE_OPENAI_API_KEY=${cfg.azureApiKey}`);
        }
      }
    } else if (cfg.llmProvider === "openai" || cfg.openaiApiKey) {
      lines.push("LLM_PROVIDER=openai");
      if (cfg.openaiApiKey) lines.push(`OPENAI_API_KEY=${cfg.openaiApiKey}`);
      if (cfg.openaiModel)  lines.push(`OPENAI_MODEL=${cfg.openaiModel}`);
    }
    // Azure cloud persistence — write even if empty so the user can clear them
    if (cfg.azureStorageAccount !== undefined) lines.push(`AZURE_STORAGE_ACCOUNT=${cfg.azureStorageAccount}`);
    if (cfg.azureKeyVaultUrl    !== undefined) lines.push(`AZURE_KEYVAULT_URL=${cfg.azureKeyVaultUrl}`);
    if (cfg.azureCosmosEndpoint !== undefined) lines.push(`AZURE_COSMOS_ENDPOINT=${cfg.azureCosmosEndpoint}`);
    if (cfg.azureTenantId       !== undefined) lines.push(`CICD_AGENT_AZURE_TENANT_ID=${cfg.azureTenantId}`);
    if (cfg.azureClientId       !== undefined) lines.push(`CICD_AGENT_AZURE_CLIENT_ID=${cfg.azureClientId}`);
    if (cfg.reviewAutoApproveEnabled !== undefined) lines.push(`REVIEW_AUTO_APPROVE_ENABLED=${cfg.reviewAutoApproveEnabled ? "true" : "false"}`);
    if (cfg.reviewStaleAgeHours !== undefined) lines.push(`REVIEW_STALE_AGE_HOURS=${cfg.reviewStaleAgeHours}`);

    if (lines.length > 0) {
      // Merge with existing file: keep lines whose key we are NOT overwriting
      const newKeys = new Set(lines.map((l) => l.split("=")[0] ?? ""));
      let existing: string[] = [];
      if (nodeFs.existsSync(envFile)) {
        existing = nodeFs.readFileSync(envFile, "utf8")
          .split("\n")
          .filter((l) => {
            const key = (l.split("=")[0] ?? "").trim();
            return key && !newKeys.has(key);
          });
      }
      nodeFs.mkdirSync(envDir, { recursive: true });
      nodeFs.writeFileSync(envFile, [...existing, ...lines].join("\n") + "\n", "utf8");

      // Hot-reload: update process.env so new sessions pick up the new creds
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          process.env[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
        }
      }
    }

    // Re-evaluate llmConfigured from the freshly set env vars
    const provider = process.env["LLM_PROVIDER"] === "openai" ? "openai" : "azure";
    const isAzure = provider === "azure" && !!(process.env["AZURE_OPENAI_ENDPOINT"] && process.env["AZURE_OPENAI_API_KEY"]);
    const isOpenAI = provider === "openai" && !!(process.env["OPENAI_API_KEY"] && process.env["OPENAI_MODEL"]);
    const nowConfigured = isAzure || isOpenAI;

    // Patch the live settings object so /healthz reflects the new state immediately
    (settings as Record<string, unknown>)["llmProvider"] = provider;
    (settings as Record<string, unknown>)["llmConfigured"] = nowConfigured;
    if (cfg.azureEndpoint !== undefined)
      (settings as Record<string, unknown>)["azureOpenAiEndpoint"] = cfg.azureEndpoint;
    if (cfg.azureApiKey !== undefined)
      (settings as Record<string, unknown>)["azureOpenAiApiKey"] = cfg.azureApiKey || settings.azureOpenAiApiKey;
    if (cfg.azureDeployment !== undefined)
      (settings as Record<string, unknown>)["azureOpenAiChatDeployment"] = cfg.azureDeployment || settings.azureOpenAiChatDeployment;
    if (cfg.azureApiVersion !== undefined)
      (settings as Record<string, unknown>)["azureOpenAiApiVersion"] = cfg.azureApiVersion || settings.azureOpenAiApiVersion;
    if (cfg.openaiApiKey !== undefined)
      (settings as Record<string, unknown>)["openAiApiKey"] = cfg.openaiApiKey;
    if (cfg.openaiModel !== undefined)
      (settings as Record<string, unknown>)["openAiModel"] = cfg.openaiModel;
    if (cfg.azureStorageAccount !== undefined)
      (settings as Record<string, unknown>)["azureStorageAccount"] = cfg.azureStorageAccount;
    if (cfg.azureKeyVaultUrl !== undefined)
      (settings as Record<string, unknown>)["azureKeyVaultUrl"] = cfg.azureKeyVaultUrl;
    if (cfg.azureCosmosEndpoint !== undefined)
      (settings as Record<string, unknown>)["azureCosmosEndpoint"] = cfg.azureCosmosEndpoint;
    if (cfg.reviewAutoApproveEnabled !== undefined)
      (settings as Record<string, unknown>)["reviewAutoApproveEnabled"] = cfg.reviewAutoApproveEnabled;
    if (cfg.reviewStaleAgeHours !== undefined)
      (settings as Record<string, unknown>)["reviewStaleAgeHours"] = cfg.reviewStaleAgeHours;

    const cloudStores = {
      cloudProfileStore: !!(settings.azureStorageAccount),
      cloudSecrets:      !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };

    return { ok: true, llmConfigured: nowConfigured, ...cloudStores };
  });

  app.post("/tasks/submit-pipeline", async (req, reply) => {
    const parsed = SubmitPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const taskId = queue.submit("submit-pipeline", parsed.data);
    return reply.code(202).send({ taskId, status: "queued" });
  });

  app.get("/tasks", async () => queue.list(50));

  app.get("/tasks/:taskId", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const view = queue.get(parsed.data.taskId);
    if (!view) return reply.code(404).send({ error: "task not found" });
    return view as TaskView;
  });

  app.get("/tasks/:taskId/events", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const taskId = parsed.data.taskId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const view = queue.get(taskId);
    if (!view) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "task not found" })}\n\n`);
      reply.raw.end();
      return;
    }

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Replay existing steps.
    for (const step of view.steps) send("step", step);
    send("status", view.status);

    if (view.status === "succeeded" || view.status === "failed" || view.status === "cancelled") {
      send("done", { status: view.status, result: view.result, error: view.error });
      reply.raw.end();
      return;
    }

    const em = queue.emitterFor(taskId);
    if (!em) {
      reply.raw.end();
      return;
    }
    const onStep = (s: unknown) => send("step", s);
    const onStatus = (s: unknown) => send("status", s);
    const onDone = (s: unknown) => {
      send("done", s);
      cleanup();
      reply.raw.end();
    };
    const cleanup = (): void => {
      em.off("step", onStep);
      em.off("status", onStatus);
      em.off("done", onDone);
    };
    em.on("step", onStep);
    em.on("status", onStatus);
    em.on("done", onDone);
    req.raw.on("close", () => {
      cleanup();
    });
  });

  // ── Workspace profile endpoints ──────────────────────────────────────────────
  // Cloud-first: use AzureTableProfileStore when configured, else local JSON.
  // Key Vault integration: when kvSecrets is available, adoPat is transparently
  // stored in Key Vault and stripped/injected on read.

  async function resolveAdoPat(profileId: string, bodyPat: string): Promise<string> {
    const kv = getKvSecrets();
    if (kv && bodyPat) {
      await kv.setAdoPat(profileId, bodyPat);
      return "";
    }
    return bodyPat;
  }

  async function injectAdoPat<T extends { id: string; adoPat: string }>(profile: T): Promise<T> {
    const kv = getKvSecrets();
    if (kv) {
      const pat = await kv.getAdoPat(profile.id);
      return { ...profile, adoPat: pat ?? "" };
    }
    return profile;
  }

  async function getProfileForRequest(
    profileId: string,
    inlineProfile?: z.infer<typeof InlineProfileSchema>,
  ): Promise<Awaited<ReturnType<typeof getWorkspaceProfile>> | null> {
    if (inlineProfile?.adoOrgUrl && inlineProfile.adoProject && inlineProfile.adoRepoName) {
      return {
        id: profileId,
        name: inlineProfile.name ?? "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...inlineProfile,
      };
    }

    const ts = getTableStore();
    if (ts) {
      try {
        const cloudProfile = await ts.get(profileId);
        return cloudProfile ? await injectAdoPat(cloudProfile) : null;
      } catch (err) {
        if (isAzureAuthenticationRequiredError(err)) throw err;
        return getWorkspaceProfile(settings.dataDir, profileId);
      }
    }
    return getWorkspaceProfile(settings.dataDir, profileId);
  }

  app.get("/profiles", async () => {
    const ts = getTableStore();
    if (ts) {
      const profiles = await ts.list();
      return Promise.all(profiles.map(injectAdoPat));
    }
    return listWorkspaceProfiles(settings.dataDir);
  });

  app.get("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const ts = getTableStore();
    if (ts) {
      const profile = await ts.get(parsed.data.id);
      if (!profile) return reply.code(404).send({ error: "profile not found" });
      return injectAdoPat(profile);
    }
    const profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    return profile;
  });

  app.post("/profiles", async (req, reply) => {
    const parsed = ProfileBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data as WorkspaceProfileInput;
    const ts = getTableStore();
    if (ts) {
      const safePat = await resolveAdoPat("__new__", data.adoPat);
      const profile = await ts.create({ ...data, adoPat: safePat });
      const kv = getKvSecrets();
      if (kv && parsed.data.adoPat) await kv.setAdoPat(profile.id, parsed.data.adoPat);
      return reply.code(201).send(await injectAdoPat(profile));
    }
    const profile = createWorkspaceProfile(settings.dataDir, data);
    return reply.code(201).send(profile);
  });

  app.put("/profiles/:id", async (req, reply) => {
    const paramParsed = ProfileIdParam.safeParse(req.params);
    if (!paramParsed.success) return reply.code(400).send({ error: "invalid id" });
    const bodyParsed = ProfileBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });
    const id = paramParsed.data.id;
    const data = bodyParsed.data;
    const ts = getTableStore();
    if (ts) {
      const kv = getKvSecrets();
      if (data.adoPat !== undefined && kv) {
        if (data.adoPat) await kv.setAdoPat(id, data.adoPat);
        data.adoPat = "";
      }
      const updated = await ts.update(id, data);
      if (!updated) return reply.code(404).send({ error: "profile not found" });
      return injectAdoPat(updated);
    }
    const updated = updateWorkspaceProfile(settings.dataDir, id, data);
    if (!updated) return reply.code(404).send({ error: "profile not found" });
    return updated;
  });

  app.delete("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const id = parsed.data.id;
    const ts = getTableStore();
    if (ts) {
      const kv = getKvSecrets();
      if (kv) await kv.deleteAdoPat(id);
      const ok = await ts.delete(id);
      if (!ok) return reply.code(404).send({ error: "profile not found" });
      return { ok: true };
    }
    const ok = deleteWorkspaceProfile(settings.dataDir, id);
    if (!ok) return reply.code(404).send({ error: "profile not found" });
    return { ok: true };
  });

  app.post("/profiles/discover", async (req, reply) => {
    const parsed = AdoDiscoverySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const profile = parsed.data.profile;
    if (!profile.adoOrgUrl) return reply.code(400).send({ error: "ado_org_required" });
    try {
      return {
        source: "internal" as const,
        kind: parsed.data.kind,
        items: await discoverAdoOptions(parsed.data.kind, profile),
      };
    } catch (err) {
      return sendAdoDiagnostic(reply, err, profile.adoPat ? "pat" : "oauth");
    }
  });

  const checkAdoToolsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = AdoMcpCheckSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const profile = parsed.data.profile;
    if (!profile.adoOrgUrl) return reply.code(400).send({ error: "ado_org_required" });
    try {
      return await checkAzureDevOpsTools({
        organization: profile.adoOrgUrl,
        pat: profile.adoPat,
      });
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, profile.adoPat ? "pat" : "oauth");
      return reply.code(400).send({
        ok: false,
        source: "internal" as const,
        authMode: diagnostic.authMode,
        authStatus: diagnostic.status,
        authMessage: diagnostic.message,
        retryable: diagnostic.retryable,
        error: diagnostic.message,
      });
    }
  };
  app.post("/profiles/check-ado-tools", checkAdoToolsHandler);
  app.post("/profiles/check-mcp", checkAdoToolsHandler);

  const pullRequestsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ProfilePayloadSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });
    const statusParam = typeof (req.query as Record<string, unknown>)["status"] === "string"
      ? String((req.query as Record<string, unknown>)["status"])
      : "active";
    const status = ["active", "completed", "abandoned", "all"].includes(statusParam)
      ? statusParam as "active" | "completed" | "abandoned" | "all"
      : "active";

    const profile = await getProfileForRequest(parsed.data.id, parsedBody.data.profile);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!profile.adoOrgUrl || !profile.adoProject || !profile.adoRepoName) {
      return reply.code(400).send({ error: "ado_profile_incomplete" });
    }

    const adoAuth = await getAzureDevOpsAuth(profile.adoPat);

    const prs = await listAzurePullRequests({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      auth: adoAuth,
      status,
      top: 50,
    });
    const runs = profile.adoPipelineId
      ? await listAzurePipelineRuns({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        pipelineId: profile.adoPipelineId,
        auth: adoAuth,
        top: 100,
      })
      : [];
    return {
      pullRequests: prs.map((pr) => ({
        ...pr,
        pipelineRun: runs.find((run) => run.sourceBranch === pr.sourceBranch),
      })),
    };
  };
  app.get("/profiles/:id/pull-requests", pullRequestsHandler);
  app.post("/profiles/:id/pull-requests", pullRequestsHandler);

  const pullRequestContextHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ProfilePullRequestParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ProfilePayloadSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const profile = await getProfileForRequest(parsed.data.id, parsedBody.data.profile);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!profile.adoOrgUrl || !profile.adoProject || !profile.adoRepoName) {
      return reply.code(400).send({ error: "ado_profile_incomplete" });
    }

    let adoAuth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>;
    try {
      adoAuth = await getAzureDevOpsAuth(profile.adoPat);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, profile.adoPat ? "pat" : "oauth");
    }
    let pullRequest: Awaited<ReturnType<typeof getAzurePullRequestById>>;
    let threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
    let changes: Awaited<ReturnType<typeof listAzurePullRequestChanges>>;
    let builds: Awaited<ReturnType<typeof listAzureBuilds>>;
    let workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
    let policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
    try {
      pullRequest = await getAzurePullRequestById({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        repository: profile.adoRepoName,
        pullRequestId: parsed.data.pullRequestId,
        auth: adoAuth,
        includeWorkItemRefs: true,
      });
      [threads, changes, builds, workItems, policies] = await Promise.all([
        listAzurePullRequestThreads({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
          top: 100,
        }),
        listAzurePullRequestChanges({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
          top: 100,
        }),
        profile.adoPipelineId
          ? listAzureBuilds({
            organization: profile.adoOrgUrl,
            project: profile.adoProject,
            auth: adoAuth,
            definitions: [profile.adoPipelineId],
            branchName: pullRequest.sourceBranch,
            top: 20,
          })
          : Promise.resolve([]),
        listAzurePullRequestWorkItems({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
        }).catch(() => []),
        listAzurePullRequestPolicyEvaluations({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
        }).catch(() => []),
      ]);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, adoAuth.mode);
    }

    return {
      source: "internal" as const,
      pullRequest,
      threads,
      changes,
      builds,
      workItems,
      policies,
    };
  };
  app.get("/profiles/:id/pull-requests/:pullRequestId/context", pullRequestContextHandler);
  app.post("/profiles/:id/pull-requests/:pullRequestId/context", pullRequestContextHandler);

  const PrInsightPreviewBodySchema = z.object({
    llmConfig: LlmConfigSchema,
    profile: InlineProfileSchema,
  }).default({});

  function heuristicPrInsight(args: {
    title: string;
    description: string;
    fileCount: number;
    threadCount: number;
    unresolvedThreadCount: number;
    failedBuildCount: number;
    changedPaths: string[];
  }): string {
    const lines: string[] = [];
    lines.push(`PR insight for "${args.title || "untitled PR"}": ${args.fileCount} changed file(s), ${args.threadCount} thread(s), and ${args.failedBuildCount} failed build(s).`);
    if (args.unresolvedThreadCount > 0) lines.push(`${args.unresolvedThreadCount} thread(s) may need attention before merge.`);
    if (args.failedBuildCount > 0) lines.push("Pipeline history includes failed or canceled builds; inspect the latest run before approving.");
    if (args.changedPaths.length > 0) lines.push(`Touched areas: ${args.changedPaths.slice(0, 8).join(", ")}${args.changedPaths.length > 8 ? ", ..." : ""}.`);
    if (args.description) lines.push("The PR description is available and should be checked against the changed files.");
    return lines.join("\n");
  }

  function buildPrInsightSignals(args: {
    description: string;
    fileCount: number;
    threadCount: number;
    unresolvedThreadCount: number;
    failedBuildCount: number;
    workItemCount: number;
    changedPaths: string[];
  }) {
    const blocking: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];
    if (args.failedBuildCount > 0) {
      blocking.push(`${args.failedBuildCount} failed/canceled build(s)`);
    }
    if (args.unresolvedThreadCount > 0) {
      warnings.push(`${args.unresolvedThreadCount} active thread(s)`);
    }
    if (args.fileCount >= 20) {
      warnings.push(`large PR: ${args.fileCount} changed file(s)`);
    } else if (args.fileCount >= 10) {
      info.push(`medium-sized PR: ${args.fileCount} changed file(s)`);
    }
    if (!args.description.trim()) {
      warnings.push("missing PR description");
    }
    if (args.workItemCount === 0) {
      info.push("no linked work items");
    }
    const touched = args.changedPaths.map((path) => path.toLowerCase());
    if (touched.some((path) => path.includes("auth") || path.includes("security") || path.includes("permission"))) {
      warnings.push("security/auth-sensitive files changed");
    }
    if (touched.some((path) => path.includes("migration") || path.includes("schema") || path.endsWith(".sql"))) {
      warnings.push("database/schema files changed");
    }
    const readiness =
      blocking.length > 0 ? "blocked" :
      warnings.length > 0 ? "needs_attention" :
      "ready";
    return {
      readiness,
      risks: [...blocking, ...warnings],
      categories: { blocking, warnings, info },
    };
  }

  function readinessFromDecision(queue: "auto_approved" | "needs_human_review" | "blocked" | "watching") {
    if (queue === "auto_approved") return "ready" as const;
    if (queue === "blocked") return "blocked" as const;
    return "needs_attention" as const;
  }

  function categoriesFromReviewFindings(findings: Array<{ severity: string; category: string; file: string; line: number }>) {
    const format = (finding: { category: string; file: string; line: number }) =>
      `${finding.category}: ${finding.file}:${finding.line}`;
    return {
      blocking: findings.filter((finding) => finding.severity === "blocking").map(format),
      warnings: findings.filter((finding) => finding.severity === "warning").map(format),
      info: findings.filter((finding) => finding.severity === "info").map(format),
    };
  }

  app.post("/profiles/:id/pull-requests/:pullRequestId/insight-preview", async (req, reply) => {
    const parsed = ProfilePullRequestParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = PrInsightPreviewBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const inlineProfile = parsedBody.data.profile;
    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (inlineProfile?.adoOrgUrl && inlineProfile.adoProject && inlineProfile.adoRepoName) {
      profile = {
        id: parsed.data.id,
        name: inlineProfile.name ?? "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...inlineProfile,
      };
    } else if (ts) {
      try {
        const cloudProfile = await ts.get(parsed.data.id);
        profile = cloudProfile ? await injectAdoPat(cloudProfile) : null;
      } catch (err) {
        if (isAzureAuthenticationRequiredError(err)) throw err;
        profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
      }
    } else {
      profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    }
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!profile.adoOrgUrl || !profile.adoProject || !profile.adoRepoName) {
      return reply.code(400).send({ error: "ado_profile_incomplete" });
    }

    let adoAuth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>;
    try {
      adoAuth = await getAzureDevOpsAuth(profile.adoPat);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, profile.adoPat ? "pat" : "oauth");
    }
    let pullRequest: Awaited<ReturnType<typeof getAzurePullRequestById>>;
    let threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
    let changes: Awaited<ReturnType<typeof listAzurePullRequestChanges>>;
    let builds: Awaited<ReturnType<typeof listAzureBuilds>>;
    let workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
    let policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
    try {
      pullRequest = await getAzurePullRequestById({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        repository: profile.adoRepoName,
        pullRequestId: parsed.data.pullRequestId,
        auth: adoAuth,
        includeWorkItemRefs: true,
      });
      [threads, changes, builds, workItems, policies] = await Promise.all([
        listAzurePullRequestThreads({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
          top: 100,
        }),
        listAzurePullRequestChanges({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
          top: 100,
        }),
        profile.adoPipelineId
          ? listAzureBuilds({
            organization: profile.adoOrgUrl,
            project: profile.adoProject,
            auth: adoAuth,
            definitions: [profile.adoPipelineId],
            branchName: pullRequest.sourceBranch,
            top: 20,
          })
          : Promise.resolve([]),
        listAzurePullRequestWorkItems({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
        }).catch(() => []),
        listAzurePullRequestPolicyEvaluations({
          organization: profile.adoOrgUrl,
          project: profile.adoProject,
          repository: profile.adoRepoName,
          pullRequestId: parsed.data.pullRequestId,
          auth: adoAuth,
        }).catch(() => []),
      ]);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, adoAuth.mode);
    }

    const failedBuildCount = builds.filter((build) => build.result === "failed" || build.result === "canceled").length;
    const threadCount = threads.filter((thread) => thread.comments.length > 0).length;
    const unresolvedThreadCount = threads.filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2").length;
    const failedPolicyCount = policies.filter((policy) => /failed|rejected|error/i.test(policy.status)).length;
    const workItemCount = workItems.length || pullRequest.workItemRefs.length;
    const changedPaths = changes.changes.map((change) => change.path || change.originalPath).filter(Boolean);
    const readinessSignals = buildPrReadinessSignalMetadata({
      builds,
      policies,
      threads,
      workItems,
    });
    const fallbackSummary = heuristicPrInsight({
      title: pullRequest.title,
      description: pullRequest.description,
      fileCount: changes.fileCount,
      threadCount,
      unresolvedThreadCount,
      failedBuildCount,
      changedPaths,
    });
    const insightSignals = buildPrInsightSignals({
      description: pullRequest.description,
      fileCount: changes.fileCount,
      threadCount,
      unresolvedThreadCount,
      failedBuildCount,
      workItemCount,
      changedPaths,
    });
    if (failedPolicyCount > 0) {
      insightSignals.categories.blocking.push(`${failedPolicyCount} failed/error policy evaluation(s)`);
      insightSignals.risks.push(`${failedPolicyCount} failed/error policy evaluation(s)`);
      insightSignals.readiness = "blocked";
    }

    const effectiveSettings = buildReviewLlmSettings(parsedBody.data.llmConfig);
    const llm = new LLMClient(effectiveSettings);
    const signals = {
      fileCount: changes.fileCount,
      threadCount,
      failedBuildCount,
      workItemCount,
      ...readinessSignals,
    };
    if (!llm.configured) {
      return {
        source: "heuristic" as const,
        summary: fallbackSummary,
        readiness: insightSignals.readiness,
        risks: insightSignals.risks,
        categories: insightSignals.categories,
        signals,
        tokensIn: 0,
        tokensOut: 0,
      };
    }

    const prompt = [
      `PR #${pullRequest.id}: ${pullRequest.title}`,
      `Description: ${pullRequest.description || "(none)"}`,
      `Source: ${pullRequest.sourceBranch} -> ${pullRequest.targetBranch}`,
      `Files (${changes.fileCount}): ${changedPaths.slice(0, 30).join(", ") || "(none)"}`,
      `Threads: ${threadCount}, likely active: ${unresolvedThreadCount}`,
      `Builds: ${builds.length}, failed/canceled: ${failedBuildCount}`,
      `Policies: ${policies.length}, failed/error: ${failedPolicyCount}`,
      `Work items: ${workItems.map((item) => `#${item.id} ${item.title}`.trim()).join(", ") || pullRequest.workItemRefs.map((item) => item.id).join(", ") || "(none)"}`,
      "",
      "Write a concise PR insight summary for a developer. Include risk signals, readiness, and next checks. Do not invent code details.",
    ].join("\n");
    const result = await llm.chat({
      messages: [
        { role: "system", content: "You summarize Azure DevOps pull request metadata for developer review readiness." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 700,
    });

    return {
      source: "llm" as const,
      summary: result.content || fallbackSummary,
      readiness: insightSignals.readiness,
      risks: insightSignals.risks,
      categories: insightSignals.categories,
      signals,
      tokensIn: llm.usage.promptTokens,
      tokensOut: llm.usage.completionTokens,
    };
  });

  app.get("/profiles/:id/review-queue", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (ts) {
      try {
        profile = await ts.get(parsed.data.id);
      } catch (err) {
        if (isAzureAuthenticationRequiredError(err)) throw err;
        profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
      }
    } else {
      profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    }
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!settings.azureStorageAccount) {
      const items = listLocalReviewHistory({
        dataDir: settings.dataDir,
        repository: profile.adoRepoName,
        limit: 100,
      });
      return { items, configured: false, storage: "local" as const };
    }
    // If Azure auth is unavailable, return empty queue instead of crashing
    let items: Awaited<ReturnType<typeof listReviewQueueItems>>;
    try {
      items = await listReviewQueueItems({
        storageAccount: settings.azureStorageAccount,
        repository: profile.adoRepoName,
        limit: 100,
      });
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
      return { items: [], configured: true, error: "Azure storage unavailable. Try again later." };
    }
    return { items, configured: true };
  });

  app.post("/profiles/:id/review-history", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewHistoryUpsertSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    const record: ReviewHistoryRecord = {
      repository,
      pullRequestId: parsedBody.data.pullRequestId,
      lastIterationId: parsedBody.data.lastIterationId,
      findingCount: parsedBody.data.findingCount,
      lastRunAt: parsedBody.data.lastRunAt,
      sourceCommit: parsedBody.data.sourceCommit,
      decisionQueue: parsedBody.data.decisionQueue,
      decisionRiskLevel: parsedBody.data.decisionRiskLevel,
      decisionReason: parsedBody.data.decisionReason,
      decisionReasonCodes: parsedBody.data.decisionReasonCodes,
      contextConfidence: parsedBody.data.contextConfidence,
      autoApprovedAt: parsedBody.data.autoApprovedAt,
      autoApprovalActor: parsedBody.data.autoApprovalActor,
      lastTokensIn: parsedBody.data.lastTokensIn,
      lastTokensOut: parsedBody.data.lastTokensOut,
      discardedFindingCount: parsedBody.data.discardedFindingCount,
      hunkCoverageFiles: parsedBody.data.hunkCoverageFiles,
      wholeFileFallbackFiles: parsedBody.data.wholeFileFallbackFiles,
      changedHunkLines: parsedBody.data.changedHunkLines,
      manualDisposition: parsedBody.data.manualDisposition,
      manualDispositionAt: parsedBody.data.manualDispositionAt,
      manualDispositionActor: parsedBody.data.manualDispositionActor,
      manualDispositionNote: parsedBody.data.manualDispositionNote,
      manualDispositionEvents: parsedBody.data.manualDispositionEvents,
      manualDispositionWriteBackAttempted: parsedBody.data.manualDispositionWriteBackAttempted,
      manualDispositionWriteBackOk: parsedBody.data.manualDispositionWriteBackOk,
      manualDispositionWriteBackError: parsedBody.data.manualDispositionWriteBackError,
      manualDispositionWriteBackAt: parsedBody.data.manualDispositionWriteBackAt,
      manualDispositionWriteBackThreadId: parsedBody.data.manualDispositionWriteBackThreadId,
      manualDispositionWriteBackUrl: parsedBody.data.manualDispositionWriteBackUrl,
      manualDispositionWriteBackEvents: parsedBody.data.manualDispositionWriteBackEvents,
    };

    if (settings.azureStorageAccount) {
      return reply.code(400).send({
        error: "cloud_configured",
        message: "Use the cloud Review Agent to persist history when Azure Table Storage is configured.",
      });
    }

    const saved = upsertLocalReviewHistory(settings.dataDir, record);
    return { ok: true, record: saved, storage: "local" as const };
  });

  app.get("/profiles/:id/review-operations", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    return {
      items: listLocalReviewOperations({
        dataDir: settings.dataDir,
        repository,
        limit: 50,
      }),
      storage: "local" as const,
    };
  });

  app.post("/profiles/:id/review-operations", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewOperationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    const saved = appendLocalReviewOperation(settings.dataDir, {
      kind: parsedBody.data.kind as ReviewOperationKind,
      at: parsedBody.data.at,
      repository,
      pullRequestId: parsedBody.data.pullRequestId,
      actor: parsedBody.data.actor,
      label: parsedBody.data.label,
      ok: parsedBody.data.ok,
      details: parsedBody.data.details,
    });
    return { ok: true, record: saved, storage: "local" as const };
  });

  app.get("/profiles/:id/pr-insights", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    const query = z.object({
      pullRequestId: z.coerce.number().int().nonnegative().optional(),
      limit: z.coerce.number().int().positive().max(200).default(50),
    }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const items = listLocalPrInsightArtifacts({
        dataDir: settings.dataDir,
        profileId: parsedId.data.id,
        repository,
        pullRequestId: query.data.pullRequestId,
        limit: query.data.limit,
      });
    return {
      items,
      history: summarizePrInsightArtifactHistory(items),
      storage: "local" as const,
    };
  });

  app.get("/profiles/:id/pr-insights/artifact", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });

    const query = z.object({
      artifactId: z.string().min(1),
    }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });

    const record = getLocalPrInsightArtifact({
      dataDir: settings.dataDir,
      profileId: parsedId.data.id,
      artifactId: query.data.artifactId,
    });
    if (!record) return reply.code(404).send({ error: "artifact not found" });
    return { record, storage: "local" as const };
  });

  app.post("/profiles/:id/pr-insights", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = PrInsightArtifactSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = parsedBody.data.repository.trim() || profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    const saved = upsertLocalPrInsightArtifact(settings.dataDir, {
      profileId: parsedId.data.id,
      repository,
      pullRequestId: parsedBody.data.pullRequestId,
      title: parsedBody.data.title,
      kind: parsedBody.data.kind,
      at: parsedBody.data.at,
      summary: parsedBody.data.summary,
      readiness: parsedBody.data.readiness,
      decisionQueue: parsedBody.data.decisionQueue,
      decisionRiskLevel: parsedBody.data.decisionRiskLevel,
      contextConfidence: parsedBody.data.contextConfidence,
      risks: parsedBody.data.risks,
      categories: parsedBody.data.categories,
      signals: parsedBody.data.signals,
      iterationId: parsedBody.data.iterationId,
      sourceCommit: parsedBody.data.sourceCommit,
      findingCount: parsedBody.data.findingCount,
      discardedFindingCount: parsedBody.data.discardedFindingCount,
      tokensIn: parsedBody.data.tokensIn,
      tokensOut: parsedBody.data.tokensOut,
    });
    return { ok: true, record: saved, storage: "local" as const };
  });

  app.post("/profiles/:id/review-disposition", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewDispositionUpsertSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const ts = getTableStore();
    let profile = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
    if (ts) {
      try {
        const cloudProfile = await ts.get(parsedId.data.id);
        profile = cloudProfile ? await injectAdoPat(cloudProfile) : profile;
      } catch {
        /* local fallback */
      }
    }
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    const repository = profile.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: "profile has no adoRepoName" });

    const record: ReviewHistoryRecord = {
      repository,
      pullRequestId: parsedBody.data.pullRequestId,
      lastIterationId: parsedBody.data.lastIterationId,
      findingCount: parsedBody.data.findingCount,
      lastRunAt: parsedBody.data.lastRunAt,
      sourceCommit: parsedBody.data.sourceCommit,
      decisionQueue: parsedBody.data.decisionQueue,
      decisionRiskLevel: parsedBody.data.decisionRiskLevel,
      decisionReason: parsedBody.data.decisionReason,
      decisionReasonCodes: parsedBody.data.decisionReasonCodes,
      contextConfidence: parsedBody.data.contextConfidence,
      autoApprovedAt: parsedBody.data.autoApprovedAt,
      autoApprovalActor: parsedBody.data.autoApprovalActor,
      lastTokensIn: parsedBody.data.lastTokensIn,
      lastTokensOut: parsedBody.data.lastTokensOut,
      discardedFindingCount: parsedBody.data.discardedFindingCount,
      hunkCoverageFiles: parsedBody.data.hunkCoverageFiles,
      wholeFileFallbackFiles: parsedBody.data.wholeFileFallbackFiles,
      changedHunkLines: parsedBody.data.changedHunkLines,
      manualDisposition: parsedBody.data.manualDisposition,
      manualDispositionAt: parsedBody.data.manualDispositionAt,
      manualDispositionActor: parsedBody.data.manualDispositionActor,
      manualDispositionNote: parsedBody.data.manualDispositionNote,
      manualDispositionEvents: parsedBody.data.manualDispositionEvents,
      manualDispositionWriteBackAttempted: parsedBody.data.manualDispositionWriteBackAttempted,
      manualDispositionWriteBackOk: parsedBody.data.manualDispositionWriteBackOk,
      manualDispositionWriteBackError: parsedBody.data.manualDispositionWriteBackError,
      manualDispositionWriteBackAt: parsedBody.data.manualDispositionWriteBackAt,
      manualDispositionWriteBackThreadId: parsedBody.data.manualDispositionWriteBackThreadId,
      manualDispositionWriteBackUrl: parsedBody.data.manualDispositionWriteBackUrl,
      manualDispositionWriteBackEvents: parsedBody.data.manualDispositionWriteBackEvents,
    };
    let saved = upsertLocalReviewHistory(settings.dataDir, record);

    let adoWriteBack: { attempted: boolean; ok: boolean; error?: string; at?: string; threadId?: string; url?: string } = {
      attempted: false,
      ok: false,
    };
    const shouldWriteBack =
      parsedBody.data.writeBackToAdo &&
      (parsedBody.data.manualDisposition === "changes_requested" || parsedBody.data.manualDisposition === "marked_blocked");
    if (shouldWriteBack) {
      adoWriteBack = { attempted: true, ok: false };
      try {
        if (!profile.adoOrgUrl || !profile.adoProject || !profile.adoRepoName) {
          throw new Error("Project Link is missing Azure DevOps organization, project, or repository.");
        }
        const ado = new AdoClient({
          organization: extractAdoOrg(profile.adoOrgUrl),
          authHeaderProvider: async () => (await getAzureDevOpsAuth(profile.adoPat)).header,
        });
        const thread = await ado.createThread({
          project: profile.adoProject,
          repositoryId: profile.adoRepoName,
          pullRequestId: parsedBody.data.pullRequestId,
          body: {
            status: THREAD_STATUS_ACTIVE,
            comments: [{
              commentType: COMMENT_TYPE_TEXT,
              content: [
                `**Review Queue disposition: ${parsedBody.data.manualDisposition.replace(/_/g, " ")}**`,
                "",
                parsedBody.data.manualDispositionNote || parsedBody.data.decisionReason || "No note provided.",
                "",
                `Actor: ${parsedBody.data.manualDispositionActor || "MergePilot"}`,
              ].join("\n"),
            }],
          },
        });
        const threadId = extractAdoThreadId(thread);
        adoWriteBack = {
          attempted: true,
          ok: true,
          at: new Date().toISOString(),
          threadId,
          url: extractAdoThreadUrl(thread) || buildAdoThreadUrl({
            orgUrl: profile.adoOrgUrl,
            project: profile.adoProject,
            repository: profile.adoRepoName,
            pullRequestId: parsedBody.data.pullRequestId,
            threadId,
          }),
        };
      } catch (err) {
        adoWriteBack = {
          attempted: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          at: new Date().toISOString(),
        };
      }
      saved = upsertLocalReviewHistory(settings.dataDir, {
        ...record,
        manualDispositionWriteBackAttempted: adoWriteBack.attempted,
        manualDispositionWriteBackOk: adoWriteBack.ok,
        manualDispositionWriteBackError: adoWriteBack.error ?? "",
        manualDispositionWriteBackAt: adoWriteBack.at ?? "",
        manualDispositionWriteBackThreadId: adoWriteBack.threadId ?? "",
        manualDispositionWriteBackUrl: adoWriteBack.url ?? "",
        manualDispositionWriteBackEvents: [
          ...(record.manualDispositionWriteBackEvents ?? []),
          {
            disposition: parsedBody.data.manualDisposition,
            at: adoWriteBack.at ?? new Date().toISOString(),
            ok: adoWriteBack.ok,
            actor: parsedBody.data.manualDispositionActor || "MergePilot",
            note: parsedBody.data.manualDispositionNote || parsedBody.data.decisionReason || "",
            error: adoWriteBack.error ?? "",
            threadId: adoWriteBack.threadId ?? "",
            url: adoWriteBack.url ?? "",
          },
        ],
      });
    }

    return { ok: true, record: saved, storage: "local" as const, adoWriteBack };
  });

  // ── POST /profiles/:id/review-run — run Review Agent immediately on a PR ────
  // Accepts: { pullRequestId, targetBranch?, llmConfig?, profile? }
  // Builds cloud context, runs the LLM review planner, saves result to history,
  // and returns the decision (queue, riskLevel, reason, findings count).
  const ReviewRunSchema = z.object({
    pullRequestId: z.coerce.number().int().positive(),
    targetBranch:  z.string().default(""),
    llmConfig:     LlmConfigSchema,
    profile:       InlineProfileSchema,
  });

  function extractAdoOrg(adoOrgUrl: string): string {
    try {
      const url = new URL(adoOrgUrl);
      if (url.hostname === "dev.azure.com") {
        // https://dev.azure.com/{org} → extract bare org slug
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[0] ?? adoOrgUrl;
      }
      // https://tebssg.visualstudio.com/ or any other full-URL format —
      // pass the origin directly so AdoClient doesn't prepend dev.azure.com again
      return url.origin;
    } catch {
      return adoOrgUrl;
    }
  }

  function extractAdoThreadId(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const id = (value as { id?: unknown; threadId?: unknown }).id ?? (value as { threadId?: unknown }).threadId;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
    if (typeof id === "string" && id.trim()) return id.trim();
    return "";
  }

  function extractAdoThreadUrl(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const url = (value as { url?: unknown; _links?: { web?: { href?: unknown } } })._links?.web?.href ??
      (value as { url?: unknown }).url;
    return typeof url === "string" && url.trim() ? url.trim() : "";
  }

  function buildAdoThreadUrl(args: {
    orgUrl: string;
    project: string;
    repository: string;
    pullRequestId: number;
    threadId: string;
  }): string {
    const base = args.orgUrl.replace(/\/$/, "");
    if (!base || !args.project || !args.repository || !args.threadId) return "";
    const project = encodeURIComponent(args.project);
    const repository = encodeURIComponent(args.repository);
    return `${base}/${project}/_git/${repository}/pullrequest/${args.pullRequestId}?_a=files&discussionId=${encodeURIComponent(args.threadId)}`;
  }

  function buildReviewLlmSettings(override?: InlineLlmConfig): Settings {
    const base = getSettings();
    if (!override) return base;
    const isAzure = (override.llmProvider ?? "azure") === "azure";
    const provider: "azure" | "openai" = isAzure ? "azure" : "openai";
    return {
      ...base,
      llmProvider: provider,
      azureOpenAiEndpoint:       isAzure ? (override.azureEndpoint   ?? base.azureOpenAiEndpoint)       : base.azureOpenAiEndpoint,
      azureOpenAiApiKey:         isAzure ? (override.azureApiKey     ?? base.azureOpenAiApiKey)         : base.azureOpenAiApiKey,
      azureOpenAiChatDeployment: isAzure ? (override.azureDeployment ?? base.azureOpenAiChatDeployment) : base.azureOpenAiChatDeployment,
      azureOpenAiApiVersion:     isAzure ? (override.azureApiVersion ?? base.azureOpenAiApiVersion)     : base.azureOpenAiApiVersion,
      openAiApiKey:              !isAzure ? (override.openaiApiKey   ?? base.openAiApiKey)              : base.openAiApiKey,
      openAiModel:               !isAzure ? (override.openaiModel    ?? base.openAiModel)               : base.openAiModel,
      llmConfigured: isAzure
        ? Boolean(
            (override.azureEndpoint ?? base.azureOpenAiEndpoint) &&
            (override.azureApiKey   ?? base.azureOpenAiApiKey),
          )
        : Boolean(
            (override.openaiApiKey ?? base.openAiApiKey) &&
            (override.openaiModel  ?? base.openAiModel),
          ),
    };
  }

  app.post("/profiles/:id/review-run", async (req, reply) => {
    const parsedId = ProfileIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewRunSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const { pullRequestId, targetBranch: bodyTargetBranch, llmConfig, profile: inlineProfile } = parsedBody.data;

    // Resolve profile — prefer inline data from the frontend, fall back to store.
    type MinProfile = {
      adoOrgUrl: string;
      adoProject: string;
      adoRepoName: string;
      adoPat: string;
      targetBranch: string;
      adoPipelineId: string;
    };
    let profileData: MinProfile;
    if (
      inlineProfile?.adoOrgUrl &&
      inlineProfile.adoProject &&
      inlineProfile.adoRepoName
    ) {
      profileData = {
        adoOrgUrl:   inlineProfile.adoOrgUrl,
        adoProject:  inlineProfile.adoProject,
        adoRepoName: inlineProfile.adoRepoName,
        adoPat:      inlineProfile.adoPat,
        targetBranch: inlineProfile.targetBranch,
        adoPipelineId: inlineProfile.adoPipelineId,
      };
    } else {
      const ts = getTableStore();
      let stored: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
      if (ts) {
        try {
          const cloudP = await ts.get(parsedId.data.id);
          stored = cloudP ? await injectAdoPat(cloudP) : null;
        } catch {
          stored = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
        }
      } else {
        stored = getWorkspaceProfile(settings.dataDir, parsedId.data.id);
      }
      if (!stored) return reply.code(404).send({ error: "profile not found" });
      profileData = {
        adoOrgUrl:   stored.adoOrgUrl,
        adoProject:  stored.adoProject,
        adoRepoName: stored.adoRepoName,
        adoPat:      stored.adoPat,
        targetBranch: stored.targetBranch,
        adoPipelineId: stored.adoPipelineId,
      };
    }

    if (!profileData.adoOrgUrl || !profileData.adoProject || !profileData.adoRepoName) {
      return reply.code(400).send({ error: "ado_profile_incomplete" });
    }

    const org = extractAdoOrg(profileData.adoOrgUrl);
    const ado = new AdoClient({
      organization: org,
      authHeaderProvider: async () => (await getAzureDevOpsAuth(profileData.adoPat)).header,
    });
    const stateStore = new FileStateStore(settings.dataDir);

    const effectiveSettings = buildReviewLlmSettings(llmConfig);
    const llm = new LLMClient(effectiveSettings);

    // Fetch PR iterations to determine the latest revision
    let iter: { value: Array<{
      id: number;
      sourceRefCommit: { commitId: string };
      commonRefCommit?: { commitId: string };
      targetRefCommit?: { commitId: string };
    }> };
    try {
      iter = await ado.getPullRequestIterations(profileData.adoProject, profileData.adoRepoName, pullRequestId);
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, profileData.adoPat ? "pat" : "oauth");
      if (diagnostic.status !== "unknown_error") return sendAdoDiagnostic(reply, err, profileData.adoPat ? "pat" : "oauth");
      return reply.code(400).send({ error: `ADO error: ${err instanceof Error ? err.message : String(err)}` });
    }

    const latest = iter.value[iter.value.length - 1];
    if (!latest) {
      return reply.code(400).send({ error: "no iterations found for this PR" });
    }

    const sourceCommit = (latest.sourceRefCommit as { commitId?: string })?.commitId ?? "";
    const baseCommit = (latest.commonRefCommit as { commitId?: string } | undefined)?.commitId
      ?? (latest.targetRefCommit as { commitId?: string } | undefined)?.commitId
      ?? "";
    const repository   = profileData.adoRepoName.trim();
    const conventions  = await stateStore.listConventions(repository);

    // Build diff context from ADO, then run the LLM review planner
    let bundle: Awaited<ReturnType<typeof buildCloudContext>>;
    try {
      bundle = await buildCloudContext({
        ado,
        project:      profileData.adoProject,
        repositoryId: repository,
        prId:         pullRequestId,
        iterationId:  latest.id,
        sourceCommit,
        baseCommit,
        maxFiles: 40,
      });
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, profileData.adoPat ? "pat" : "oauth");
      if (diagnostic.status !== "unknown_error") return sendAdoDiagnostic(reply, err, profileData.adoPat ? "pat" : "oauth");
      return reply.code(400).send({ error: `context error: ${err instanceof Error ? err.message : String(err)}` });
    }

    try {
      const adoAuth = await getAzureDevOpsAuth(profileData.adoPat);
      const pullRequest = await getAzurePullRequestById({
        organization: profileData.adoOrgUrl,
        project: profileData.adoProject,
        repository,
        pullRequestId,
        auth: adoAuth,
        includeWorkItemRefs: true,
      });
      const [threads, builds] = await Promise.all([
        listAzurePullRequestThreads({
          organization: profileData.adoOrgUrl,
          project: profileData.adoProject,
          repository,
          pullRequestId,
          auth: adoAuth,
          top: 100,
        }),
        profileData.adoPipelineId
          ? listAzureBuilds({
            organization: profileData.adoOrgUrl,
            project: profileData.adoProject,
            auth: adoAuth,
            definitions: [profileData.adoPipelineId],
            branchName: pullRequest.sourceBranch,
            top: 20,
          })
          : Promise.resolve([]),
      ]);
      const latestBuild = builds[0];
      bundle = {
        ...bundle,
        pullRequest: {
          title: pullRequest.title,
          description: pullRequest.description,
          status: pullRequest.status,
          isDraft: pullRequest.isDraft,
          sourceBranch: pullRequest.sourceBranch,
          targetBranch: pullRequest.targetBranch,
          createdBy: pullRequest.createdBy,
          workItemIds: pullRequest.workItemRefs.map((item) => item.id),
          reviewerCount: pullRequest.reviewerCount,
          voteSummary: pullRequest.voteSummary,
          threadCount: threads.filter((thread) => thread.comments.length > 0).length,
          activeThreadCount: threads.filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2").length,
          failedBuildCount: builds.filter((build) => build.result === "failed" || build.result === "canceled").length,
          latestBuildResult: latestBuild?.result ?? "",
          latestBuildStatus: latestBuild?.status ?? "",
        },
      };
    } catch (err) {
      app.log.warn({ err }, "could not enrich review context with ADO PR signals");
    }

    const review = await runReviewPlanner({ llm, bundle, conventions });

    const policyTargetBranch = profileData.targetBranch || "main";
    const effectiveTargetBranch = bodyTargetBranch || policyTargetBranch;
    let reviewer: Awaited<ReturnType<typeof ado.getAuthenticatedUser>> | null = null;
    try {
      reviewer = await ado.getAuthenticatedUser();
    } catch (err) {
      app.log.warn({ err }, "could not resolve ADO reviewer identity for auto-approval");
    }

    let decision = decideReviewOutcome({
      policy: {
        ...DEFAULT_AUTO_APPROVAL_POLICY,
        enabled: settings.reviewAutoApproveEnabled,
        reviewerId: reviewer?.id ?? "",
        allowedTargetBranches: [policyTargetBranch],
      },
      targetBranch: effectiveTargetBranch,
      changedFiles: bundle.files,
      findings:     review.findings,
      reviewUsedLlm: review.tokensIn > 0 || review.tokensOut > 0,
      discardedFindingCount: review.discardedFindings.length,
      hunkCoverageFiles: review.coverage.filesWithHunks,
      wholeFileFallbackFiles: review.coverage.wholeFileOnlyFiles,
      changedHunkLines: review.coverage.changedHunkLines,
    });

    const now = new Date().toISOString();
    const autoApprovalActor = reviewer?.uniqueName || reviewer?.displayName || reviewer?.id || "";
    if (decision.autoApprove && reviewer) {
      try {
        await ado.approvePullRequest({
          project: profileData.adoProject,
          repositoryId: repository,
          pullRequestId,
          reviewerId: reviewer.id,
        });
      } catch (err) {
        decision = {
          queue: "needs_human_review",
          riskLevel: decision.riskLevel,
          autoApprove: false,
          contextConfidence: decision.contextConfidence,
          reason: `Auto-approval failed: ${err instanceof Error ? err.message : String(err)}`,
          reasonCodes: [...decision.reasonCodes, "auto_approval.failed"],
        };
      }
    }

    await stateStore.upsertHistory({
      partitionKey:       repository,
      rowKey:             String(pullRequestId),
      lastIterationId:    latest.id,
      findingCount:       review.findings.length,
      lastRunAt:          now,
      sourceCommit,
      decisionQueue:      decision.queue,
      decisionRiskLevel:  decision.riskLevel,
      decisionReason:     decision.reason,
      decisionReasonCodes: decision.reasonCodes,
      contextConfidence:  decision.contextConfidence,
      autoApprovedAt:     decision.autoApprove ? now : "",
      autoApprovalActor:  decision.autoApprove ? autoApprovalActor : "",
      lastTokensIn:       review.tokensIn,
      lastTokensOut:      review.tokensOut,
      discardedFindingCount: review.discardedFindings.length,
      hunkCoverageFiles:  review.coverage.filesWithHunks,
      wholeFileFallbackFiles: review.coverage.wholeFileOnlyFiles,
      changedHunkLines:   review.coverage.changedHunkLines,
      manualDisposition: "",
      manualDispositionAt: "",
      manualDispositionActor: "",
      manualDispositionNote: "",
      manualDispositionEvents: [],
      manualDispositionWriteBackAttempted: false,
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: [],
    });

    return {
      ok:               true,
      pullRequestId,
      repository,
      iterationId:      latest.id,
      findingCount:     review.findings.length,
      decisionQueue:    decision.queue,
      decisionRiskLevel: decision.riskLevel,
      decisionReason:   decision.reason,
      decisionReasonCodes: decision.reasonCodes,
      contextConfidence: decision.contextConfidence,
      readiness:        readinessFromDecision(decision.queue),
      categories:       categoriesFromReviewFindings(review.findings),
      lastRunAt:        now,
      autoApprovalActor: decision.autoApprove ? autoApprovalActor : "",
      tokensIn:         review.tokensIn,
      tokensOut:        review.tokensOut,
      summary:          review.summary,
      findings:         review.findings,
      discardedFindings: review.discardedFindings,
      metadata:         review.metadata,
      compression:      review.compression,
      coverage:         review.coverage,
    };
  });

  // ── Profile migration: local JSON → Azure Table Storage ─────────────────────
  // One-shot; idempotent (upsert).  Returns counts of migrated vs skipped profiles.
  app.post("/profiles/migrate", async (_req, reply) => {
    const ts = getTableStore();
    if (!ts) {
      return reply.code(400).send({
        error: "cloud_not_configured",
        message: "AZURE_STORAGE_ACCOUNT is not set. Configure it in Settings first.",
      });
    }
    const local = listWorkspaceProfiles(settings.dataDir);
    if (local.length === 0) return { migrated: 0, skipped: 0, total: 0 };

    const kv = getKvSecrets();
    let migrated = 0;
    let skipped = 0;
    for (const p of local) {
      try {
        const existing = await ts.get(p.id);
        if (existing) { skipped++; continue; }
        if (kv && p.adoPat) {
          await kv.setAdoPat(p.id, p.adoPat);
          await ts.create({ ...p, adoPat: "" });
        } else {
          await ts.create(p);
        }
        migrated++;
      } catch {
        skipped++;
      }
    }
    return { migrated, skipped, total: local.length };
  });

  // ── Chat endpoints ───────────────────────────────────────────────────────────

  app.post("/chat/index-status", async (req, reply) => {
    const parsed = ChatIndexSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return getChatIndexStatus(parsed.data.repoPath);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/chat/index-refresh", async (req, reply) => {
    const parsed = ChatIndexSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const settings = buildInlineLlmSettings(parsed.data.llmConfig);
      const llm = new LLMClient(settings);
      const refresh = await refreshChatIndex({
        repoPath: parsed.data.repoPath,
        llm,
        profile: inlineProfileToIndexProfile(parsed.data.profile),
      });
      const status = getChatIndexStatus(parsed.data.repoPath);
      return { ok: true, refresh, status };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/chat/workflow-action", async (req, reply) => {
    const parsed = ChatWorkflowActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return await runWorkspaceWorkflowAction(chatSessions, parsed.data);
    } catch (err) {
      const failure = workflowActionFailureResponse(parsed.data, err);
      return reply.code(failure.httpStatus).send(failure.body);
    }
  });

  app.post("/chat", async (req, reply) => {
    const parsed = ChatStartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { message, repoPath, sessionId: existingId, profileId, llmConfig, profile } = parsed.data;
    const sessionId = existingId ?? chatSessions.createSession(repoPath, profileId);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.setHeader("X-Chat-Session-Id", sessionId);
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    const uiAdapter = new ChatUiChunkAdapter();
    const sendUiChunk = (chunk: unknown): void => send("ui.chunk", { type: "ui.chunk", chunk });
    for (const chunk of uiAdapter.start()) sendUiChunk(chunk);

    // Always send the sessionId first so the client can store it
    for (const sse of sessionStartedEvent(sessionId)) send(sse.event, sse.payload);

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.run(sessionId, message, repoPath, profileId, llmConfig, profile)) {
            for (const sse of chatEventToSseEvents(event)) send(sse.event, sse.payload);
            for (const chunk of uiAdapter.push(event)) sendUiChunk(chunk);
            if (
              event.type === "done" ||
              event.type === "error" ||
              event.type === "cancelled"
            ) {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: explainChatSseError(err, settings) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/confirm", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const ok = chatSessions.confirm(parsed.data.sessionId, true);
    if (!ok) return reply.code(404).send({ error: "no pending confirmation for this session" });
    return { ok: true };
  });

  // Dedicated confirm-action endpoint: directly executes the stored approval proposal
  // and streams tool + LLM continuation events back (same SSE format as /chat).
  app.post("/chat/:sessionId/confirm-action", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });

    const sessionId = parsed.data.sessionId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    const uiAdapter = new ChatUiChunkAdapter();
    const sendUiChunk = (chunk: unknown): void => send("ui.chunk", { type: "ui.chunk", chunk });
    for (const chunk of uiAdapter.start()) sendUiChunk(chunk);

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            for (const sse of chatEventToSseEvents(event)) send(sse.event, sse.payload);
            for (const chunk of uiAdapter.push(event)) sendUiChunk(chunk);
            if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: explainChatSseError(err, settings) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/cancel", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    chatSessions.cancel(parsed.data.sessionId);
    return { ok: true };
  });

  app.get("/chat/history", async () => {
    return chatSessions.listRecent(30);
  });

  app.patch("/chat/:sessionId/metadata", async (req, reply) => {
    const parsedParam = SessionIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid sessionId" });
    const parsedBody = ChatSessionMetadataSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });
    const updated = await chatSessions.updateMetadata(parsedParam.data.sessionId, parsedBody.data);
    if (!updated) return reply.code(404).send({ error: "session not found" });
    return updated;
  });

  app.delete("/chat/:sessionId", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const deleted = await chatSessions.deleteSession(parsed.data.sessionId);
    if (!deleted) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  app.get("/chat/checkpoints", async () => {
    return chatSessions.listCheckpointActivity(50);
  });

  app.get("/chat/checkpoints/:checkpointId/preview", async (req, reply) => {
    const parsedParam = CheckpointIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid checkpointId" });
    const parsedQuery = CheckpointPreviewQuery.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: parsedQuery.error.flatten() });
    try {
      return await previewGitCheckpoint({
        repoPath: ".",
        env: {},
        timeoutSec: 30,
        extra: { data_dir: settings.dataDir },
      }, parsedParam.data.checkpointId, parsedQuery.data.maxDiffChars ?? 12_000);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/chat/checkpoints/:checkpointId/rollback-plan", async (req, reply) => {
    const parsedParam = CheckpointIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid checkpointId" });
    try {
      return await planGitCheckpointRollback({
        repoPath: ".",
        env: {},
        timeoutSec: 30,
        extra: { data_dir: settings.dataDir },
      }, parsedParam.data.checkpointId);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/chat/:sessionId/messages", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return chatSessions.getBubbles(parsed.data.sessionId);
  });

  app.get("/chat/:sessionId/state", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return { workflowState: await chatSessions.getWorkflowState(parsed.data.sessionId) };
  });

  app.post("/shutdown", async () => {
    setTimeout(() => {
      process.exit(0);
    }, 250);
    return { ok: true, message: "shutting down" };
  });

  return app;
}

/** On Windows, inject git into process PATH so git tools work when the
 *  daemon runs as a Tauri sidecar (which inherits a minimal PATH). */
function injectGitPath(): void {
  if (process.platform !== "win32") return;
  // Already reachable — nothing to do.
  const probe = spawnSync("git", ["--version"], { shell: false, encoding: "utf8", timeout: 3000 });
  if (probe.status === 0) return;

  const sep = ";";
  const currentPath = process.env["PATH"] ?? "";

  // Try well-known Windows installation locations (checked synchronously — fast)
  const home = nodeOs.homedir();
  const userProfile = process.env["USERPROFILE"] ?? "";
  const candidates = [
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files (x86)\\Git\\cmd",
    nodePath.join(home, "AppData", "Local", "Programs", "Git", "cmd"),
    ...(userProfile ? [nodePath.join(userProfile, "AppData", "Local", "Programs", "Git", "cmd")] : []),
    "C:\\ProgramData\\scoop\\apps\\git\\current\\cmd",
    nodePath.join(home, "scoop", "apps", "git", "current", "cmd"),
  ];
  const found = candidates.find((p) => { try { return nodeFs.existsSync(p); } catch { return false; } });
  if (found) {
    process.env["PATH"] = `${found}${sep}${currentPath}`;
  }
}

export async function startServer(): Promise<FastifyInstance> {
  injectGitPath();
  const settings = getSettings();
  const app = await buildApp();
  await app.listen({ host: settings.runtimeHost, port: settings.runtimePort });
  return app;
}
