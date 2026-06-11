import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import nodeFs from "node:fs";
import nodeOs from "node:os";

// Resolve .env in priority order:
//   1. CICD_AGENT_ENV_FILE env var (explicit override)
//   2. ~/.cicd-agent/.env  (production / after installer)
//   3. <cwd>/.env          (docker / manual)
//   4. monorepo root       (development)
(function loadEnv() {
  const candidates = [
    process.env.CICD_AGENT_ENV_FILE,
    nodePath.join(nodeOs.homedir(), ".cicd-agent", ".env"),
    nodePath.join(process.cwd(), ".env"),
    // Development: walk up from packages/daemon/src to repo root
    (() => {
      try {
        return nodePath.resolve(fileURLToPath(import.meta.url), "../../../../.env");
      } catch {
        return null;
      }
    })(),
  ].filter((p): p is string => typeof p === "string");

  for (const p of candidates) {
    if (nodeFs.existsSync(p)) {
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
  listAzureBuilds,
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
  isAzureAuthAvailable,
  persistUserCache,
  loadPersistedUser,
  clearPersistedUser,
  getCachedAzureAccounts,
  loginWithBrowser,
  loginWithCachedAccount,
  isAzureAuthenticationRequiredError,
  resetUserCache,
  runCommand,
  previewGitCheckpoint,
  planGitCheckpointRollback,
  LLMClient,
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
}).optional();


const ChatStartSchema = z.object({
  message:   z.string().min(1),
  repoPath:  z.string().default(process.cwd()),
  sessionId: z.string().optional(),
  profileId: z.string().optional(),  // kept for backwards compat; ignored when profile is provided
  llmConfig: LlmConfigSchema,        // inline LLM config from localStorage Settings
  profile:   InlineProfileSchema,    // inline profile data from localStorage Profiles
});
const ChatIndexSchema = z.object({
  repoPath: z.string().default(process.cwd()),
  llmConfig: LlmConfigSchema,
  profile: InlineProfileSchema,
});
const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const CheckpointIdParam = z.object({ checkpointId: z.string().min(1) });
const CheckpointPreviewQuery = z.object({
  maxDiffChars: z.coerce.number().int().min(0).max(100_000).optional(),
});
const ProfileIdParam = z.object({ id: z.string().min(1) });
const ProfilePullRequestParam = z.object({
  id: z.string().min(1),
  pullRequestId: z.coerce.number().int().positive(),
});

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
    pat,
    top: 100,
  });
}

function sendAdoDiagnostic(reply: FastifyReply, err: unknown, authMode?: "oauth" | "pat") {
  const diagnostic = adoAuthDiagnosticFromError(err, authMode);
  return reply.code(diagnostic.status === "oauth_unavailable" ? 401 : 400).send({
    error: diagnostic.message,
    authStatus: diagnostic.status,
    authMode: diagnostic.authMode,
    authMessage: diagnostic.message,
    retryable: diagnostic.retryable,
  });
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

  app.get("/healthz", async () => ({
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSec: (Date.now() - startedAt) / 1000,
    llmConfigured: settings.llmConfigured,
    // Read live settings values so Apply in the UI is reflected immediately
    cloudProfileStore: !!(settings.azureStorageAccount),
    cloudSecrets:      !!(settings.azureKeyVaultUrl),
    cloudSessions:     !!(settings.azureCosmosEndpoint),
  }));

  // ── /auth/status — instant cached user (no Azure round-trip) ────────────────
  app.get("/auth/status", async () => {
    const cached = loadPersistedUser(settings.dataDir);
    if (cached && cached.oid !== "anonymous") {
      return { authenticated: true, oid: cached.oid, upn: cached.upn, name: cached.name, avatarDataUrl: cached.avatarDataUrl, fromCache: true };
    }
    return { authenticated: false, fromCache: true };
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
      upn:  user.upn,
      name: user.name,
      avatarDataUrl: user.avatarDataUrl,
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
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
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

  app.get("/profiles/:id/pull-requests", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const statusParam = typeof (req.query as Record<string, unknown>)["status"] === "string"
      ? String((req.query as Record<string, unknown>)["status"])
      : "active";
    const status = ["active", "completed", "abandoned", "all"].includes(statusParam)
      ? statusParam as "active" | "completed" | "abandoned" | "all"
      : "active";

    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (ts) {
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
  });

  app.get("/profiles/:id/pull-requests/:pullRequestId/context", async (req, reply) => {
    const parsed = ProfilePullRequestParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (ts) {
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
    try {
      pullRequest = await getAzurePullRequestById({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        repository: profile.adoRepoName,
        pullRequestId: parsed.data.pullRequestId,
        auth: adoAuth,
        includeWorkItemRefs: true,
      });
      [threads, changes, builds] = await Promise.all([
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
    };
  });

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
    try {
      pullRequest = await getAzurePullRequestById({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        repository: profile.adoRepoName,
        pullRequestId: parsed.data.pullRequestId,
        auth: adoAuth,
        includeWorkItemRefs: true,
      });
      [threads, changes, builds] = await Promise.all([
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
      ]);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, adoAuth.mode);
    }

    const failedBuildCount = builds.filter((build) => build.result === "failed" || build.result === "canceled").length;
    const threadCount = threads.filter((thread) => thread.comments.length > 0).length;
    const unresolvedThreadCount = threads.filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2").length;
    const changedPaths = changes.changes.map((change) => change.path || change.originalPath).filter(Boolean);
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
      workItemCount: pullRequest.workItemRefs.length,
      changedPaths,
    });

    const effectiveSettings = buildReviewLlmSettings(parsedBody.data.llmConfig);
    const llm = new LLMClient(effectiveSettings);
    if (!llm.configured) {
      return {
        source: "heuristic" as const,
        summary: fallbackSummary,
        readiness: insightSignals.readiness,
        risks: insightSignals.risks,
        categories: insightSignals.categories,
        signals: {
          fileCount: changes.fileCount,
          threadCount,
          failedBuildCount,
          workItemCount: pullRequest.workItemRefs.length,
        },
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
      `Work items: ${pullRequest.workItemRefs.map((item) => item.id).join(", ") || "(none)"}`,
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
      signals: {
        fileCount: changes.fileCount,
        threadCount,
        failedBuildCount,
        workItemCount: pullRequest.workItemRefs.length,
      },
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
                `Actor: ${parsedBody.data.manualDispositionActor || "Dev Agent"}`,
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
            actor: parsedBody.data.manualDispositionActor || "Dev Agent",
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

    // Always send the sessionId first so the client can store it
    for (const sse of sessionStartedEvent(sessionId)) send(sse.event, sse.payload);

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.run(sessionId, message, repoPath, profileId, llmConfig, profile)) {
            for (const sse of chatEventToSseEvents(event)) send(sse.event, sse.payload);
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
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
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

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            for (const sse of chatEventToSseEvents(event)) send(sse.event, sse.payload);
            if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
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
