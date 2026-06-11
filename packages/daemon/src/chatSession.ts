import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ChatPlanner,
  LLMClient,
  getSettings,
  ToolExecutor,
  toolRequiresApproval,
  StdioMcpClient,
  createMcpToolsFromClient,
  runCommand,
  splitCommand,
  isConfirmationMessage,
  isDenialMessage,
  getWorkspaceProfile,
  profileToToolExtra,
  type ChatEvent,
  type ChatMessage,
  type ChatPlannerResult,
  type ChatWorkflowState,
  type PendingToolAction,
  type Tool,
  type ToolContext,
  type Settings,
  azureDevOpsTools,
  dotnetTools,
  createGitCheckpoint,
  gitTools,
  gitIntentTool,
  npmTools,
  pytestTools,
  CosmosSessionStore,
  resetCosmosClient,
  isAzureAuthenticationRequiredError,
  listLocalPrInsightArtifacts,
  type PrInsightArtifactRecord,
  type CosmosStoredSession,
} from "@cicd-agent/core";
import {
  buildChatContext,
  chatContextToPrompt,
  describeChatContext,
  refreshChatIndex,
  type ChatContextProfile,
} from "@cicd-agent/core/chatContext";
// Inline config types (mirrored from server.ts ChatStartSchema — kept here to
// avoid a circular import since server.ts imports ChatSessionManager).
export interface InlineLlmConfig {
  llmProvider?:     "azure" | "openai";
  azureEndpoint?:   string;
  azureApiKey?:     string;
  azureDeployment?: string;
  azureApiVersion?: string;
  openaiApiKey?:    string;
  openaiModel?:     string;
}

export interface InlineProfile {
  id?:             string;
  name?:           string;
  repoPath:        string;
  defaultBranch:   string;
  targetBranch:    string;
  adoOrgUrl:       string;
  adoProject:      string;
  adoRepoName:     string;
  adoPat:          string;
  adoPipelineId:   string;
  adoPipelineName: string;
  adoMcpEnabled:   boolean;
  adoMcpCommand:   string;
  adoMcpAuthentication: string;
  adoMcpDomains:   string;
  templateProfile: string;
  buildCommand:    string;
  testCommand:     string;
}

// ─── Cosmos DB session store (opt-in) ────────────────────────────────────────
// Re-evaluated whenever the endpoint changes so /daemon/configure hot-reload
// is reflected without a daemon restart.

let _cosmosStore: CosmosSessionStore | null = null;
let _cosmosEndpoint: string | null = null;

function getCosmosStore(): CosmosSessionStore | null {
  const settings = getSettings();
  const endpoint = settings.azureCosmosEndpoint;
  if (!endpoint) return null;
  if (_cosmosEndpoint !== endpoint) {
    // Endpoint changed — reset the SDK-level singleton so a fresh client is used
    resetCosmosClient();
    _cosmosEndpoint = endpoint;
    _cosmosStore = new CosmosSessionStore(endpoint, settings.azureCosmosSessionTtlSec);
  }
  return _cosmosStore;
}

// ─── Persistent history store (JSON file, capped at 200 messages per session) ─

interface StoredBubble {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  timestamp: number;
  // tool bubbles
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;   // full structured output for renderers
  checkpointId?: string;
  checkpointPath?: string;
  // assistant result metadata (hidden from main bubble, shown in Details)
  riskLevel?: string;
  actionsTaken?: string[];
  suggestions?: string[];
  repoPath?: string;
}

interface StoredSession {
  id: string;
  createdAt: number;
  repoPath: string;
  profileId?: string;             // optional workspace profile binding
  messages: ChatMessage[];        // for LLM context
  bubbles: StoredBubble[];        // for UI restoration
  approvalProposal?: PendingToolAction; // last write action awaiting user approval
  /** @deprecated Use approvalProposal. Kept so old local/Cosmos sessions can be resumed. */
  pendingAction?: PendingToolAction;
  workflowState?: ChatWorkflowState;
  llmConfig?: InlineLlmConfig;    // persisted so confirm-action can reuse the same creds
  inlineProfile?: InlineProfile;  // persisted so confirm-action has ADO/profile context
}

type HistoryStore = Record<string, StoredSession>;

type ChatExecutorMode = "planner" | "confirmed-action";

export interface ChatCheckpointActivity {
  id: string;
  sessionId: string;
  repoPath: string;
  profileId?: string;
  at: number;
  toolName: string;
  toolSummary?: string;
  toolOk?: boolean;
  checkpointId: string;
  checkpointPath: string;
  safetyCheckpointId?: string;
  safetyCheckpointPath?: string;
  targetCheckpointId?: string;
  applyMode?: string;
  restoredFiles?: string[];
}

function chatTools(): Tool[] {
  return [
    ...gitTools(),
    ...dotnetTools(),
    ...npmTools(),
    ...pytestTools(),
    ...azureDevOpsTools(),
    gitIntentTool(),
  ];
}

function chatContextTools(llm: LLMClient): Tool[] {
  return [
    {
      name: "repo_refresh_index",
      description:
        "Refresh the local repository understanding index for the current Project Link. Use when the user asks the agent to understand, scan, index, or re-index the project before answering.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      handler: async (ctx) => {
        const stats = await refreshChatIndex({ repoPath: ctx.repoPath, llm });
        return {
          ok: true,
          repoPath: ctx.repoPath,
          filesSeen: stats.filesSeen,
          filesIndexed: stats.filesIndexed,
          embedded: stats.embedded,
          summary: `Refreshed repository index: ${stats.filesSeen} files seen, ${stats.filesIndexed} updated, ${stats.embedded} embedded.`,
        };
      },
    },
  ];
}

interface ChatToolExecutors {
  plannerExecutor: ToolExecutor;
  actionExecutor: ToolExecutor;
  close: () => Promise<void>;
}

interface BuiltContextPrompt {
  prompt?: string;
  notes: string[];
}

export async function createChatToolExecutors(ctx: ToolContext, llm = new LLMClient()): Promise<ChatToolExecutors> {
  const clients: StdioMcpClient[] = [];
  const tools = [...chatTools(), ...chatContextTools(llm), ...await optionalAzureDevOpsMcpTools(ctx, clients)];
  const plannerExecutor = createChatToolExecutor(ctx, "planner", tools);
  const actionExecutor = createChatToolExecutor(ctx, "confirmed-action", tools);
  return {
    plannerExecutor,
    actionExecutor,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}

function createChatToolExecutor(ctx: ToolContext, mode: ChatExecutorMode, tools: Tool[]): ToolExecutor {
  const executor = new ToolExecutor(
    ctx,
    mode === "planner"
      ? ({ tool }) => !toolRequiresApproval(tool)
      : undefined,
    mode === "confirmed-action"
      ? async ({ toolName, tool }) => {
          if (toolName === "git_checkpoint") return;
          if (!toolName.startsWith("git_")) return;
          if (!toolRequiresApproval(tool)) return;
          const checkpoint = await createGitCheckpoint(ctx, `before ${toolName}`);
          return {
            checkpointId: checkpoint["checkpointId"],
            checkpointPath: checkpoint["path"],
          };
        }
      : undefined,
  );
  executor.registerMany(tools);
  return executor;
}

export function checkpointMetadataFromToolResult(
  toolResult: unknown,
): { checkpointId: string; checkpointPath: string } | undefined {
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const result = toolResult as Record<string, unknown>;
  const metadata = result["execution_metadata"];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const beforeExecute = (metadata as Record<string, unknown>)["beforeExecute"];
  if (typeof beforeExecute !== "object" || beforeExecute === null) return undefined;
  const checkpointId = (beforeExecute as Record<string, unknown>)["checkpointId"];
  const checkpointPath = (beforeExecute as Record<string, unknown>)["checkpointPath"];
  if (typeof checkpointId !== "string" || !checkpointId) return undefined;
  if (typeof checkpointPath !== "string" || !checkpointPath) return undefined;
  return { checkpointId, checkpointPath };
}

function checkpointApplyMetadataFromToolResult(
  toolName: string | undefined,
  toolResult: unknown,
): Pick<ChatCheckpointActivity, "targetCheckpointId" | "applyMode" | "restoredFiles"> | undefined {
  if (toolName !== "git_checkpoint_apply") return undefined;
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const result = toolResult as Record<string, unknown>;
  const checkpointId = result["checkpointId"];
  if (typeof checkpointId !== "string" || !checkpointId) return undefined;
  const mode = result["mode"];
  const restoredFiles = result["restoredFiles"];
  return {
    targetCheckpointId: checkpointId,
    applyMode: typeof mode === "string" ? mode : undefined,
    restoredFiles: Array.isArray(restoredFiles)
      ? restoredFiles.filter((file): file is string => typeof file === "string")
      : undefined,
  };
}

async function optionalAzureDevOpsMcpTools(ctx: ToolContext, clients: StdioMcpClient[]): Promise<Tool[]> {
  const profileEnabled = asBoolean(ctx.extra["ado_mcp_enabled"]);
  if (!profileEnabled && !isEnabled(process.env.CICD_AGENT_ADO_MCP_ENABLED)) return [];
  const org = azureDevOpsOrgSlug(String(ctx.extra["ado_org"] ?? getSettings().azureDevOpsOrg ?? ""));
  if (!org) return [];
  const pat = String(ctx.extra["ado_pat"] ?? "").trim();
  const env: Record<string, string> = {};
  if (pat) env.PERSONAL_ACCESS_TOKEN = Buffer.from(`:${pat}`).toString("base64");
  const commandSpec = nonEmptyString(ctx.extra["ado_mcp_command"]) || process.env.CICD_AGENT_ADO_MCP_COMMAND || "mcp-server-azuredevops";
  const [command, ...commandArgs] = splitCommand(commandSpec);
  if (!command) return [];
  const authentication =
    nonEmptyString(ctx.extra["ado_mcp_authentication"]) ||
    (pat ? "pat" : (process.env.CICD_AGENT_ADO_MCP_AUTHENTICATION || "azcli"));
  const domains =
    nonEmptyString(ctx.extra["ado_mcp_domains"]) ||
    process.env.CICD_AGENT_ADO_MCP_DOMAINS ||
    "repositories,pipelines,work-items";
  const client = new StdioMcpClient({
    name: "ado",
    command,
    args: [
      ...commandArgs,
      org,
      "--authentication",
      authentication,
      "--domains",
      domains,
    ],
    env,
    timeoutMs: Number(process.env.CICD_AGENT_ADO_MCP_TIMEOUT_MS ?? 15_000),
  });
  try {
    const tools = await createMcpToolsFromClient("ado", client);
    clients.push(client);
    return tools;
  } catch {
    await client.close();
    return [];
  }
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "1" || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes";
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function inlineProfileToToolExtra(profile: InlineProfile): Record<string, unknown> {
  const orgBase = profile.adoOrgUrl.replace(/\/$/, "");
  return {
    ado_org: orgBase,
    ado_project: profile.adoProject,
    ado_repository: profile.adoRepoName,
    ado_target_branch: profile.targetBranch,
    ado_pat: profile.adoPat,
    ...(profile.adoPipelineId ? { ado_pipeline_id: profile.adoPipelineId } : {}),
    ado_mcp_enabled: profile.adoMcpEnabled,
    ado_mcp_command: profile.adoMcpCommand,
    ado_mcp_authentication: profile.adoMcpAuthentication,
    ado_mcp_domains: profile.adoMcpDomains,
  };
}

function azureDevOpsOrgSlug(value: string): string {
  const raw = value.trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.hostname === "dev.azure.com") {
      return url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
    if (url.hostname.endsWith(".visualstudio.com")) {
      return url.hostname.split(".")[0] ?? "";
    }
    return raw;
  } catch {
    return raw;
  }
}

function historyPath(): string {
  return path.join(getSettings().dataDir, "chat-history.json");
}

function loadStoreSync(): HistoryStore {
  const p = historyPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as HistoryStore;
  } catch {
    return {};
  }
}

function saveStoreSync(store: HistoryStore): void {
  const p = historyPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
}

// ── Cosmos-aware async helpers ────────────────────────────────────────────────

async function loadSession(sessionId: string): Promise<StoredSession | null> {
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      const doc = await cosmos.load(sessionId);
      if (doc) return cosmosToStored(doc);
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
      // fall through to local
    }
  }
  return loadStoreSync()[sessionId] ?? null;
}

async function saveSession(session: StoredSession): Promise<void> {
  const cosmos = getCosmosStore();
  if (cosmos) {
    try {
      await cosmos.save(storedToCosmos(session));
      return;
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
      // fall through to local
    }
  }
  const store = loadStoreSync();
  store[session.id] = session;
  saveStoreSync(store);
}

/** Map Cosmos document back to local StoredSession shape. */
function cosmosToStored(doc: CosmosStoredSession): StoredSession {
  return {
    id:            doc.id,
    createdAt:     doc.createdAt,
    repoPath:      doc.repoPath,
    profileId:     doc.profileId,
    messages:      doc.messages as ChatMessage[],
    bubbles:       doc.bubbles as StoredBubble[],
    approvalProposal: doc.approvalProposal as PendingToolAction | undefined,
    pendingAction: doc.pendingAction as PendingToolAction | undefined,
    workflowState: doc.workflowState as ChatWorkflowState | undefined,
    llmConfig:     doc.llmConfig as InlineLlmConfig | undefined,
    inlineProfile: doc.inlineProfile as InlineProfile | undefined,
  };
}

/** Map local StoredSession to Cosmos document shape. */
function storedToCosmos(s: StoredSession): Omit<CosmosStoredSession, "userId" | "updatedAt"> {
  return {
    id:            s.id,
    createdAt:     s.createdAt,
    repoPath:      s.repoPath,
    profileId:     s.profileId,
    messages:      s.messages,
    bubbles:       s.bubbles,
    approvalProposal: s.approvalProposal,
    pendingAction: s.pendingAction,
    workflowState: s.workflowState,
    llmConfig:     s.llmConfig,
    inlineProfile: s.inlineProfile,
  };
}

/** Synchronous fallback for code paths that must stay sync (legacy helpers). */
function loadStore(): HistoryStore {
  return loadStoreSync();
}

function saveStore(store: HistoryStore): void {
  saveStoreSync(store);
}

// ─── Active-session in-memory state ──────────────────────────────────────────

interface ActiveSession {
  repoPath: string;
  confirmResolver: ((confirmed: boolean) => void) | null;
  abortController: AbortController;
}

// ─── Inline config helpers ────────────────────────────────────────────────────

/**
 * Merge inline LLM config from the frontend (localStorage Settings) on top of
 * the env-based defaults. This lets the installed app work without a .env file.
 */
function buildEffectiveSettings(override?: InlineLlmConfig): Settings {
  const base = getSettings();
  if (!override) return base;
  const isAzure = (override.llmProvider ?? "azure") === "azure";
  return {
    ...base,
    llmProvider: isAzure ? "azure" : "openai",
    azureOpenAiEndpoint:        isAzure ? (override.azureEndpoint   ?? base.azureOpenAiEndpoint)        : base.azureOpenAiEndpoint,
    azureOpenAiApiKey:          isAzure ? (override.azureApiKey     ?? base.azureOpenAiApiKey)          : base.azureOpenAiApiKey,
    azureOpenAiChatDeployment:  isAzure ? (override.azureDeployment ?? base.azureOpenAiChatDeployment)  : base.azureOpenAiChatDeployment,
    azureOpenAiApiVersion:      isAzure ? (override.azureApiVersion ?? base.azureOpenAiApiVersion)      : base.azureOpenAiApiVersion,
    openAiApiKey:               !isAzure ? (override.openaiApiKey   ?? base.openAiApiKey)               : base.openAiApiKey,
    openAiModel:                !isAzure ? (override.openaiModel    ?? base.openAiModel)                : base.openAiModel,
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

// ─── ChatSessionManager ───────────────────────────────────────────────────────

export class ChatSessionManager {
  private readonly active = new Map<string, ActiveSession>();
  private readonly contextIndexRefreshAt = new Map<string, number>();

  createSession(repoPath: string, profileId?: string): string {
    const id = `chat_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const session: StoredSession = { id, createdAt: now(), repoPath, profileId, messages: [], bubbles: [] };
    // Fire-and-forget async save; local sync fallback happens inside saveSession
    saveSession(session).catch(() => {
      const store = loadStoreSync();
      store[id] = session;
      saveStoreSync(store);
    });
    this.active.set(id, {
      repoPath,
      confirmResolver: null,
      abortController: new AbortController(),
    });
    return id;
  }

  async getHistory(sessionId: string, limit = 40): Promise<ChatMessage[]> {
    const session = await loadSession(sessionId);
    return (session?.messages ?? []).slice(-limit);
  }

  async getBubbles(sessionId: string): Promise<StoredBubble[]> {
    const session = await loadSession(sessionId);
    return session?.bubbles ?? [];
  }

  async getWorkflowState(sessionId: string): Promise<ChatWorkflowState | undefined> {
    const session = await loadSession(sessionId);
    return session?.workflowState;
  }

  private async appendMessage(sessionId: string, role: "user" | "assistant", content: string): Promise<void> {
    const session = await loadSession(sessionId);
    if (!session) return;
    session.messages.push({ role, content, timestamp: now() });
    if (session.messages.length > 200) session.messages = session.messages.slice(-200);
    await saveSession(session);
  }

  async appendBubble(sessionId: string, bubble: StoredBubble): Promise<void> {
    const session = await loadSession(sessionId);
    if (!session) return;
    session.bubbles.push(bubble);
    if (session.bubbles.length > 400) session.bubbles = session.bubbles.slice(-400);
    await saveSession(session);
  }

  confirm(sessionId: string, confirmed: boolean): boolean {
    const session = this.active.get(sessionId);
    if (!session?.confirmResolver) return false;
    session.confirmResolver(confirmed);
    session.confirmResolver = null;
    return true;
  }

  cancel(sessionId: string): void {
    const session = this.active.get(sessionId);
    if (session) {
      session.abortController.abort();
      if (session.confirmResolver) {
        session.confirmResolver(false);
        session.confirmResolver = null;
      }
      this.active.delete(sessionId);
    }
  }

  async listRecent(limit = 30): Promise<Array<{ sessionId: string; preview: string; createdAt: number }>> {
    const cosmos = getCosmosStore();
    if (cosmos) {
      try {
        return await cosmos.listRecent(limit);
      } catch {
        // fall through to local
      }
    }
    const store = loadStoreSync();
    return Object.values(store)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((s) => {
        const last = s.messages[s.messages.length - 1];
        return {
          sessionId: s.id,
          preview: last ? last.content.slice(0, 100) : "",
          createdAt: s.createdAt,
        };
      });
  }

  async listCheckpointActivity(limit = 50): Promise<ChatCheckpointActivity[]> {
    const sessions: StoredSession[] = [];
    const cosmos = getCosmosStore();
    if (cosmos) {
      try {
        const recent = await cosmos.listRecent(Math.max(limit * 2, 30));
        for (const item of recent) {
          const session = await loadSession(item.sessionId);
          if (session) sessions.push(session);
        }
      } catch {
        // fall through to local
      }
    }
    if (sessions.length === 0) {
      sessions.push(...Object.values(loadStoreSync()));
    }

    return sessions
      .flatMap((session) => session.bubbles
        .filter((bubble) => bubble.role === "tool" && bubble.checkpointId && bubble.checkpointPath)
        .map((bubble) => {
          const applyMetadata = checkpointApplyMetadataFromToolResult(bubble.toolName, bubble.toolResult);
          return {
            id: `${session.id}:${bubble.timestamp}:${bubble.toolName ?? "tool"}:${bubble.checkpointId}`,
            sessionId: session.id,
            repoPath: session.repoPath,
            profileId: session.profileId,
            at: bubble.timestamp,
            toolName: bubble.toolName ?? "tool",
            toolSummary: bubble.toolSummary,
            toolOk: bubble.toolOk,
            checkpointId: bubble.checkpointId!,
            checkpointPath: bubble.checkpointPath!,
            safetyCheckpointId: applyMetadata ? bubble.checkpointId! : undefined,
            safetyCheckpointPath: applyMetadata ? bubble.checkpointPath! : undefined,
            ...applyMetadata,
          };
        }))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  async *run(
    sessionId: string,
    message: string,
    repoPath: string,
    profileId?: string,
    llmConfig?: InlineLlmConfig,
    inlineProfile?: InlineProfile,
  ): AsyncGenerator<ChatEvent> {
    // ── Ensure session is active ─────────────────────────────────────────────
    if (!this.active.has(sessionId)) {
      const storedCheck = await loadSession(sessionId);
      if (!storedCheck) {
        yield { type: "error", message: "session not found" };
        return;
      }
      this.active.set(sessionId, {
        repoPath,
        confirmResolver: null,
        abortController: new AbortController(),
      });
    }

    const session = this.active.get(sessionId)!;

    // Prefer the inline profile's repoPath (sent from the frontend) over the
    // top-level repoPath parameter.  Chat.tsx may send "." as the fallback when
    // its local state hasn't been populated yet, while the inline profile always
    // carries the user-configured workspace path.
    const effectiveRepoPath = (inlineProfile?.repoPath?.trim() || repoPath.trim()) || ".";
    session.repoPath = effectiveRepoPath;

    // Update repoPath, profileId, llmConfig, and inlineProfile in store.
    // Persisting these lets confirm-action reuse the same credentials and
    // ADO context without the frontend needing to re-send them.
    {
      const storedSession = await loadSession(sessionId);
      if (storedSession) {
        storedSession.repoPath = effectiveRepoPath;
        if (profileId) storedSession.profileId = profileId;
        if (llmConfig) storedSession.llmConfig = llmConfig;
        if (inlineProfile) storedSession.inlineProfile = inlineProfile;
        await saveSession(storedSession);
      }
    }

    // ── Resolve workspace profile extras (ADO PAT, org, project, etc.) ──────
    // Prefer inline profile sent from the frontend over a stored profile lookup.
    let profileExtra: Record<string, unknown> = {};
    if (inlineProfile) {
      profileExtra = inlineProfileToToolExtra(inlineProfile);
    } else {
      const storedForProfile = await loadSession(sessionId);
      const resolvedProfileId = profileId ?? storedForProfile?.profileId;
      if (resolvedProfileId) {
        const p = getWorkspaceProfile(getSettings().dataDir, resolvedProfileId);
        if (p) profileExtra = profileToToolExtra(p);
      }
    }

    // ── Build shared tool context plus separate executors for planner vs.
    // confirmed actions. The planner executor uses an approval callback ported
    // from OpenHarness' approve-before-execute pattern as a runtime backstop.
    const toolCtx: ToolContext = {
      repoPath: session.repoPath,
      env: {},
      timeoutSec: 60,
      extra: profileExtra,
    };
    const effectiveSettings = buildEffectiveSettings(llmConfig);
    const llm = new LLMClient(effectiveSettings);
    const toolRuntime = await createChatToolExecutors(toolCtx, llm);
    const { plannerExecutor, actionExecutor } = toolRuntime;
    const planner = new ChatPlanner(llm, plannerExecutor);
    const waitForConfirm = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        session.confirmResolver = resolve;
      });

    try {
      // ── Persist user message ───────────────────────────────────────────────
      await this.appendBubble(sessionId, { role: "user", content: message, timestamp: now(), repoPath });
      await this.appendMessage(sessionId, "user", message);

      // ── Confirmation / Denial resolver ─────────────────────────────────────
      {
        const storedSession = await loadSession(sessionId);
        // If no stored approval proposal, attempt to infer one from the last assistant message.
        const storedProposal = storedSession ? storedApprovalProposal(storedSession) : undefined;
        const inferredProposal = isConfirmationMessage(message)
          ? inferPendingAction(storedSession?.messages ?? [])
          : undefined;
        const pending = storedProposal ?? inferredProposal;

        if (pending) {
          if (isDenialMessage(message)) {
            // User cancelled — clear the proposal and acknowledge.
            if (storedSession) {
              clearStoredApprovalProposal(storedSession);
              storedSession.workflowState = buildWorkflowState([], undefined, "done", "cancelled");
              await saveSession(storedSession);
            }
            yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: false };
            yield { type: "workflow_state", state: buildWorkflowState([], undefined, "done", "cancelled") };
            const doneEvent: ChatEvent = {
              type: "done",
              result: {
                response: "Got it — cancelled. Let me know when you're ready to continue.",
                riskLevel: "low",
                actionsTaken: [],
                suggestions: [],
                toolCallsMade: [],
                usedLlm: false,
              },
            };
            await this.appendMessage(sessionId, "assistant", doneEvent.result.response);
            await this.appendBubble(sessionId, { role: "assistant", content: doneEvent.result.response, timestamp: now() });
            yield doneEvent;
            return;
          }

          if (isConfirmationMessage(message)) {
            // Clear pending from store immediately so it won't fire again
            if (storedSession) {
              clearStoredApprovalProposal(storedSession);
              storedSession.workflowState = buildWorkflowState([], undefined, "running", pending.tool);
              await saveSession(storedSession);
            }

            yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: true };
            yield { type: "workflow_state", state: buildWorkflowState([], undefined, "running", pending.tool) };
            // ── Execute the tool directly — no LLM round trip ───────────────
            yield { type: "tool_start", name: pending.tool, args: pending.args };
            let toolResult: unknown;
            let ok = true;
            try {
              toolResult = await actionExecutor.call(pending.tool, pending.args);
            } catch (err) {
              ok = false;
              toolResult = { error: err instanceof Error ? err.message : String(err) };
            }
            const summary = truncateStr(JSON.stringify(toolResult), 300);
            const checkpointMetadata = checkpointMetadataFromToolResult(toolResult);
            yield { type: "tool_end", name: pending.tool, ok, summary, result: toolResult };

            // Persist tool bubble
            await this.appendBubble(sessionId, {
              role: "tool",
              content: summary,
              timestamp: now(),
              toolName: pending.tool,
              toolArgs: pending.args,
              toolOk: ok,
              toolSummary: summary,
              toolResult: toolResult,
              ...checkpointMetadata,
            });

            // Add context to LLM history so it knows what was done
            await this.appendMessage(
              sessionId,
              "assistant",
              `[executed] ${pending.tool}(${JSON.stringify(pending.args)}): ${summary}`,
            );

            // ── Ask LLM what the next step is ─────────────────────────────────
            const continuationMsg = ok
              ? `${pending.tool} completed${pending.nextHint ? ` — next: ${pending.nextHint}` : ""}. Report result and continue the workflow.`
              : `${pending.tool} failed: ${summary}. What should we do?`;

            await this.appendMessage(sessionId, "user", continuationMsg);
            const history22 = await this.getHistory(sessionId, 22);
            yield { type: "progress", message: "Refreshing project context" };
            const context = await this.buildContextPrompt(session.repoPath, continuationMsg, llm, inlineProfile, profileId);
            yield { type: "progress", message: "Planning next step" };

            yield* this._runPlannerAndPersist(
              sessionId, continuationMsg, history22, session.repoPath, planner, waitForConfirm, context.prompt, context.notes,
            );
            return;
          }
        }
      }

      // ── Normal LLM flow ────────────────────────────────────────────────────
      const history = await this.getHistory(sessionId, 20);
      yield { type: "progress", message: "Reading project context" };
      const context = await this.buildContextPrompt(session.repoPath, message, llm, inlineProfile, profileId);
      yield { type: "progress", message: "Planning response" };
      yield* this._runPlannerAndPersist(
        sessionId, message, history, session.repoPath, planner, waitForConfirm, context.prompt, context.notes,
      );
    } finally {
      await toolRuntime.close();
      // Always clean up the active entry — even if the server force-closes the generator
      this.active.delete(sessionId);
    }
  }

  /**
   * Directly execute the session's stored approval proposal (invoked by the
   * dedicated /confirm-action endpoint — not via a chat message).
   * After execution, asks the LLM for the NEXT single workflow step only
   * (no re-running of read tools).
   */
  async *confirmAction(sessionId: string): AsyncGenerator<ChatEvent> {
    // Load approval proposal, using heuristic fallback if the LLM omitted the JSON field.
    const storedSession = await loadSession(sessionId);
    const pending = storedSession
      ? storedApprovalProposal(storedSession) ?? inferPendingAction(storedSession.messages)
      : undefined;

    if (!pending || !storedSession) {
      yield { type: "error", message: "No approval proposal for this session" };
      return;
    }

    // Register as active (prevents duplicate runs; try/finally guarantees cleanup)
    this.active.set(sessionId, {
      repoPath: storedSession.repoPath,
      confirmResolver: null,
      abortController: new AbortController(),
    });

    let toolRuntime: ChatToolExecutors | null = null;
    try {
      // Clear immediately so a double-click cannot re-trigger the same action.
      clearStoredApprovalProposal(storedSession);
      storedSession.workflowState = buildWorkflowState(storedSession.bubbles, undefined, "running", pending.tool);
      await saveSession(storedSession);

      const session = this.active.get(sessionId)!;
      yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: true };
      yield { type: "workflow_state", state: buildWorkflowState(storedSession.bubbles, undefined, "running", pending.tool) };

      // Build executor — prefer the persisted inline profile (sent from the
      // frontend localStorage on the original /chat request) so that ADO org,
      // project, repo, and PAT are available without a daemon-side DB lookup.
      const profileExtra: Record<string, unknown> = storedSession.inlineProfile
        ? inlineProfileToToolExtra(storedSession.inlineProfile)
        : storedSession.profileId
          ? (() => {
              const p = getWorkspaceProfile(getSettings().dataDir, storedSession.profileId!);
              return p ? profileToToolExtra(p) : {};
            })()
          : {};
      const toolCtx: ToolContext = {
        repoPath: session.repoPath,
        env: {},
        timeoutSec: 60,
        extra: profileExtra,
      };
      // Reuse the LLM config that was persisted when the session's last /chat
      // request ran — this ensures confirm-action works without the frontend
      // having to re-send credentials.
      const effectiveSettings = buildEffectiveSettings(storedSession.llmConfig);
      const llm = new LLMClient(effectiveSettings);
      toolRuntime = await createChatToolExecutors(toolCtx, llm);
      const { actionExecutor, plannerExecutor } = toolRuntime;
      const planner = new ChatPlanner(llm, plannerExecutor);

      // ── Execute the confirmed tool ─────────────────────────────────────────
      yield { type: "tool_start", name: pending.tool, args: pending.args };
      let toolResult: unknown;
      let ok = true;
      try {
        toolResult = await actionExecutor.call(pending.tool, pending.args);
      } catch (err) {
        ok = false;
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }
      const summary = truncateStr(JSON.stringify(toolResult), 300);
      const checkpointMetadata = checkpointMetadataFromToolResult(toolResult);
      yield { type: "tool_end", name: pending.tool, ok, summary, result: toolResult };

      // Persist tool bubble
      await this.appendBubble(sessionId, {
        role: "tool",
        content: summary,
        timestamp: now(),
        toolName: pending.tool,
        toolArgs: pending.args,
        toolOk: ok,
        toolSummary: summary,
        toolResult,
        ...checkpointMetadata,
      });

      // Record in LLM history
      await this.appendMessage(
        sessionId,
        "assistant",
        `[confirmed & executed] ${pending.tool}(${JSON.stringify(pending.args)}): ${summary}`,
      );

      // ── Ask LLM for the NEXT step only — no re-running of read tools ───────
      const nextHint = pending.nextHint ?? "continue workflow";
      const continuationMsg = ok
        ? `WORKFLOW STEP COMPLETED: ${pending.tool} executed successfully. Result: ${summary}. ` +
          `Next workflow step is: "${nextHint}". ` +
          `CRITICAL: Do NOT call git_status, git_diff, git_log, git_branch_list, git_current_branch, or git_remote again. ` +
          `The working tree state is already known. ` +
          `Proceed DIRECTLY to: ${nextHint}. ` +
          `If the next step requires user confirmation, propose it with approval_proposal in your JSON.`
        : `WORKFLOW STEP FAILED: ${pending.tool} failed with error: ${summary}. Explain what went wrong and propose a recovery action.`;

      await this.appendMessage(sessionId, "user", continuationMsg);
      const history = await this.getHistory(sessionId, 22);
      yield { type: "progress", message: "Refreshing project context" };
      const context = await this.buildContextPrompt(
        session.repoPath,
        continuationMsg,
        llm,
        storedSession.inlineProfile,
        storedSession.profileId,
      );
      yield { type: "progress", message: "Planning next step" };

      yield* this._runPlannerAndPersist(
        sessionId, continuationMsg, history, session.repoPath, planner, () => Promise.resolve(true), context.prompt, context.notes,
      );
    } finally {
      await toolRuntime?.close();
      this.active.delete(sessionId);
    }
  }

  /** Run the ChatPlanner, persist events, and save approval proposal state. */
  private async *_runPlannerAndPersist(
    sessionId: string,
    message: string,
    history: ChatMessage[],
    repoPath: string,
    planner: ChatPlanner,
    waitForConfirm: () => Promise<boolean>,
    contextPrompt?: string,
    contextNotes: string[] = [],
  ): AsyncGenerator<ChatEvent> {
    let assistantReply = "";
    const pendingToolArgs = new Map<string, Record<string, unknown>>();

    for await (const event of planner.run(message, history, repoPath, waitForConfirm, contextPrompt)) {
      if (event.type === "tool_start") {
        pendingToolArgs.set(event.name, event.args);
        yield event;
      } else if (event.type === "tool_end") {
        const args = pendingToolArgs.get(event.name);
        pendingToolArgs.delete(event.name);
        await this.appendBubble(sessionId, {
          role: "tool",
          content: event.summary,
          timestamp: now(),
          toolName: event.name,
          toolArgs: args,
          toolOk: event.ok,
          toolSummary: event.summary,
          toolResult: event.result,
          ...checkpointMetadataFromToolResult(event.result),
        });
        yield event;
      } else if (event.type === "done") {
        // ── Workflow-state enrichment ──────────────────────────────────────
        const bubbles = await this.getBubbles(sessionId);
        const enrichedResult = deriveWorkflowPendingAction(sessionId, event.result, bubbles);
        const suggestions = [...(enrichedResult.suggestions ?? []), ...contextNotes];
        const enrichedWithContext: ChatPlannerResult = {
          ...enrichedResult,
          suggestions,
        };
        const userFacingResult: ChatPlannerResult = {
          ...enrichedWithContext,
          approvalProposal: undefined,
        };
        const enrichedEvent: ChatEvent = { type: "done", result: userFacingResult };

        assistantReply = enrichedWithContext.response;
        await this.appendBubble(sessionId, {
          role: "assistant",
          content: enrichedWithContext.response,
          timestamp: now(),
          riskLevel: enrichedWithContext.riskLevel,
          actionsTaken: enrichedWithContext.actionsTaken,
          suggestions: enrichedWithContext.suggestions,
        });
        // Store the enriched approval proposal
        const storedForPending = await loadSession(sessionId);
        const workflowState = buildWorkflowState(
          bubbles,
          approvalProposalFromResult(enrichedWithContext),
          approvalProposalFromResult(enrichedWithContext) ? "waiting_for_approval" : "done",
          approvalProposalFromResult(enrichedWithContext)?.tool ?? "done",
          enrichedWithContext.riskLevel,
          enrichedWithContext.response,
        );
        if (storedForPending) {
          setStoredApprovalProposal(storedForPending, approvalProposalFromResult(enrichedWithContext));
          storedForPending.workflowState = workflowState;
          await saveSession(storedForPending);
        }
        yield { type: "workflow_state", state: workflowState };
        if (workflowState.pendingApproval) {
          yield { type: "approval_required", approval: workflowState.pendingApproval };
        }
        yield enrichedEvent;
      } else if (event.type === "error") {
        assistantReply = event.message;
        await this.appendBubble(sessionId, { role: "error", content: event.message, timestamp: now() });
        yield event;
      } else if (event.type === "cancelled") {
        assistantReply = "(cancelled)";
        await this.appendBubble(sessionId, { role: "system", content: "Action cancelled.", timestamp: now() });
        yield event;
      } else if (event.type === "progress") {
        yield event;
      } else {
        yield event;
      }
    }

    if (assistantReply) {
      await this.appendMessage(sessionId, "assistant", assistantReply);
    }
  }

  private async buildContextPrompt(
    repoPath: string,
    message: string,
    llm: LLMClient,
    inlineProfile?: InlineProfile,
    profileId?: string,
  ): Promise<BuiltContextPrompt> {
    try {
      const notes: string[] = [];
      const profile = inlineProfileToChatContextProfile(inlineProfile);
      const bundle = await buildChatContext({ repoPath, message, llm, profile });
      this.refreshContextIndexInBackground(repoPath, llm, profile);
      notes.push(describeChatContext(bundle));
      let prompt = chatContextToPrompt(bundle) ?? "";

      // Always inject the current git branch so the agent knows the source
      // branch without having to call git_current_branch explicitly.
      try {
        const branchResult = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: repoPath,
          allowed: ["git"],
          timeoutSec: 5,
        });
        const currentBranch = branchResult.stdout.trim();
        if (currentBranch && currentBranch !== "HEAD") {
          const targetBranch = inlineProfile?.targetBranch || inlineProfile?.defaultBranch || "main";
          const branchInfo = [
            "\n## Current Git State",
            `- Current branch: ${currentBranch}`,
            `- PR target branch: ${targetBranch}`,
            currentBranch === targetBranch
              ? `- WARNING: You are on the PR target branch. Create a feature branch before committing and pushing.`
              : "",
          ].filter(Boolean).join("\n");
          prompt = prompt ? `${prompt}\n${branchInfo}` : branchInfo;
        }
      } catch {
        // branch info is best-effort; ignore errors
      }

      const insightContext = buildPrInsightContextBundle({
        dataDir: getSettings().dataDir,
        message,
        profileId: profileId ?? inlineProfile?.id,
        repository: inlineProfile?.adoRepoName,
      });
      if (insightContext.prompt) {
        prompt = prompt ? `${prompt}\n${insightContext.prompt}` : insightContext.prompt;
        notes.push(...insightContext.notes);
      }

      return { prompt: prompt || undefined, notes };
    } catch {
      return { notes: [] };
    }
  }

  private refreshContextIndexInBackground(
    repoPath: string,
    llm: LLMClient,
    profile?: ChatContextProfile,
  ): void {
    const nowMs = Date.now();
    const key = repoPath;
    const last = this.contextIndexRefreshAt.get(key) ?? 0;
    if (nowMs - last < 5 * 60 * 1000) return;
    this.contextIndexRefreshAt.set(key, nowMs);
    void refreshChatIndex({ repoPath, llm, profile }).catch(() => undefined);
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

function inlineProfileToChatContextProfile(profile?: InlineProfile): ChatContextProfile | undefined {
  if (!profile) return undefined;
  return {
    buildCommand: profile.buildCommand,
    testCommand: profile.testCommand,
    targetBranch: profile.targetBranch || profile.defaultBranch || "main",
    pipelineName: profile.adoPipelineName,
  };
}

export function extractPullRequestIdFromMessage(message: string): number | undefined {
  const patterns = [
    /\bPR\s*#?\s*(\d{1,8})\b/i,
    /\bpull\s+request\s*#?\s*(\d{1,8})\b/i,
    /#(\d{1,8})\b/,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const id = Number(match[1]);
    if (Number.isInteger(id) && id >= 0) return id;
  }
  return undefined;
}

export function extractPrInsightArtifactIdFromMessage(message: string): string | undefined {
  const match = message.match(/\bartifact(?:\s+id)?\s+([^\s]+)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  return raw.replace(/[),.;:]+$/g, "");
}

function wantsPrInsightContext(message: string): boolean {
  return /\b(pr|pull request|review|insight|finding|risk|approval|approve|blocked|artifact)\b/i.test(message);
}

export function formatPrInsightArtifactsForChat(artifacts: PrInsightArtifactRecord[]): string | undefined {
  if (artifacts.length === 0) return undefined;
  const lines = [
    "\n## Saved PR AI Insights",
    "Use these saved AI conclusions as context. Do not rerun analysis unless the user asks for a fresh result.",
  ];
  for (const artifact of artifacts.slice(0, 3)) {
    lines.push(
      `- PR #${artifact.pullRequestId} (${artifact.kind === "review_run" ? "full review" : "preview"}) at ${artifact.at}`,
      `  - Artifact id: ${artifact.id}`,
      `  - Title: ${artifact.title || "(untitled)"}`,
      `  - Summary: ${truncateStr(artifact.summary || "No summary saved.", 500)}`,
    );
    if (artifact.readiness) lines.push(`  - Readiness: ${artifact.readiness}`);
    if (artifact.decisionQueue || artifact.decisionRiskLevel || artifact.contextConfidence) {
      lines.push([
        "  - Decision:",
        artifact.decisionQueue ? `queue=${artifact.decisionQueue}` : "",
        artifact.decisionRiskLevel ? `risk=${artifact.decisionRiskLevel}` : "",
        artifact.contextConfidence ? `confidence=${artifact.contextConfidence}` : "",
      ].filter(Boolean).join(" "));
    }
    if (typeof artifact.findingCount === "number") {
      lines.push(`  - Findings: ${artifact.findingCount}; discarded=${artifact.discardedFindingCount ?? 0}`);
    }
    if (artifact.signals) {
      lines.push(`  - Signals: files=${artifact.signals.fileCount}; threads=${artifact.signals.threadCount}; failedBuilds=${artifact.signals.failedBuildCount}; workItems=${artifact.signals.workItemCount}`);
    }
    if (artifact.risks.length > 0) {
      lines.push(`  - Risks: ${artifact.risks.slice(0, 8).join("; ")}`);
    }
    lines.push(`  - Tokens: ${artifact.tokensIn}/${artifact.tokensOut}`);
  }
  return lines.join("\n");
}

export interface PrInsightContextBundle {
  prompt?: string;
  notes: string[];
  artifactIds: string[];
}

export function buildPrInsightContextBundle(args: {
  dataDir: string;
  message: string;
  profileId?: string;
  repository?: string;
}): PrInsightContextBundle {
  if (!args.profileId || !args.repository?.trim()) return { notes: [], artifactIds: [] };
  if (!wantsPrInsightContext(args.message)) return { notes: [], artifactIds: [] };
  const artifactId = extractPrInsightArtifactIdFromMessage(args.message);
  const pullRequestId = extractPullRequestIdFromMessage(args.message);
  const candidates = listLocalPrInsightArtifacts({
    dataDir: args.dataDir,
    profileId: args.profileId,
    repository: args.repository.trim(),
    pullRequestId,
    limit: artifactId ? 100 : pullRequestId === undefined ? 3 : 2,
  });
  const artifacts = artifactId
    ? candidates.filter((artifact) => artifact.id === artifactId).slice(0, 1)
    : candidates;
  const prompt = formatPrInsightArtifactsForChat(artifacts);
  if (!prompt) return { notes: [], artifactIds: [] };
  return {
    prompt,
    artifactIds: artifacts.map((artifact) => artifact.id),
    notes: artifacts.map((artifact) => (
      `Used saved PR AI insight artifact ${artifact.id} for PR #${artifact.pullRequestId} (${artifact.kind}, ${artifact.at}).`
    )),
  };
}

export function buildPrInsightContextPrompt(args: {
  dataDir: string;
  message: string;
  profileId?: string;
  repository?: string;
}): string | undefined {
  return buildPrInsightContextBundle(args).prompt;
}

function approvalIdFor(action: PendingToolAction): string {
  return `approval_${action.tool}_${hashShort(JSON.stringify(action.args ?? {}))}`;
}

function approvalProposalFromResult(result: ChatPlannerResult): PendingToolAction | undefined {
  return result.approvalProposal;
}

function storedApprovalProposal(session: StoredSession): PendingToolAction | undefined {
  return session.approvalProposal ?? session.pendingAction;
}

function setStoredApprovalProposal(session: StoredSession, proposal: PendingToolAction | undefined): void {
  session.approvalProposal = proposal;
  session.pendingAction = undefined;
}

function clearStoredApprovalProposal(session: StoredSession): void {
  setStoredApprovalProposal(session, undefined);
}

function buildWorkflowState(
  bubbles: StoredBubble[],
  approvalProposal: PendingToolAction | undefined,
  status: ChatWorkflowState["status"],
  currentStep: string,
  riskLevel = "medium",
  explanation = "",
): ChatWorkflowState {
  const completedTools = bubbles
    .filter((b) => b.role === "tool" && b.toolName && b.toolOk !== false)
    .map((b) => b.toolName as string);
  return {
    status,
    currentStep,
    completedTools,
    pendingApproval: approvalProposal
      ? {
          id: approvalIdFor(approvalProposal),
          action: approvalProposal,
          riskLevel,
          explanation,
        }
      : undefined,
  };
}

function hashShort(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

// ── Write-action derivation ──────────────────────────────────────────────────
const ACTION_DERIVERS: Array<{
  tool: string;
  description: string;
  nextHint: string;
  buildArgs: (response: string, bubbles: StoredBubble[]) => Record<string, unknown>;
}> = [
  {
    tool: "git_add",
    description: "Stage all changes",
    nextHint: "commit staged changes",
    buildArgs: (response) => {
      const paths = extractMentionedPaths(response);
      return paths.length > 0 ? { paths } : {};
    },
  },
  {
    tool: "git_commit",
    description: "Commit staged changes",
    nextHint: "push branch",
    buildArgs: (response) => {
      const quoted = response.match(/["'`]([^"'`\n]{10,120})["'`]/)?.[1];
      const conventional = response.match(/\b(feat|fix|chore|docs|refactor|style|test|ci|build|perf)(\([^)]+\))?:\s*(.+)/i)?.[0];
      const message = quoted ?? conventional ?? "feat: update changes";
      return { message: message.trim() };
    },
  },
  {
    tool: "git_push",
    description: "Push branch to remote",
    nextHint: "create PR",
    buildArgs: (_response, bubbles) => {
      return { branch: currentBranchFromBubbles(bubbles) };
    },
  },
  {
    tool: "git_create_branch",
    description: "Create branch",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      return { name: extractBranchName(response) ?? "feature/ai-change" };
    },
  },
  {
    tool: "git_checkout",
    description: "Switch branch or revision",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      return { ref: extractGitRef(response) ?? "HEAD" };
    },
  },
  {
    tool: "git_pull",
    description: "Pull changes from remote",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const ref = extractGitRef(response);
      const lower = response.toLowerCase();
      return {
        remote: "origin",
        ...(ref ? { branch: ref.replace(/^origin\//, "") } : {}),
        rebase: lower.includes("rebase"),
        ffOnly: lower.includes("ff-only") || lower.includes("fast-forward only"),
      };
    },
  },
  {
    tool: "git_merge",
    description: "Merge branch or revision",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      return { ref: extractGitRef(response) ?? "main" };
    },
  },
  {
    tool: "git_rebase",
    description: "Rebase current branch",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      return { onto: extractGitRef(response) ?? "main", autostash: response.toLowerCase().includes("autostash") };
    },
  },
  {
    tool: "git_restore",
    description: "Restore files",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const paths = extractMentionedPaths(response);
      return {
        paths,
        staged: response.toLowerCase().includes("unstage") || response.toLowerCase().includes("staged"),
      };
    },
  },
  {
    tool: "git_stash",
    description: "Stash working-tree changes",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const lower = response.toLowerCase();
      if (lower.includes("pop") || lower.includes("restore")) return { action: "pop" };
      const msg = response.match(/stash(?: message)?:\s*["'`]?([^"'`\n]{4,80})["'`]?/i)?.[1];
      return msg ? { action: "push", message: msg.trim() } : { action: "push" };
    },
  },
  {
    tool: "ado_create_pr",
    description: "Create pull request",
    nextHint: "done",
    buildArgs: (response, bubbles) => {
      const source_branch = currentBranchFromBubbles(bubbles);
      const titleMatch = response.match(/(?:title|PR title|pull request title)[:\s]+["']?([^\n"']{5,100})["']?/i);
      const title = titleMatch?.[1] ?? `Update from ${source_branch}`;
      return { source_branch, title, description: response.slice(0, 300) };
    },
  },
];

/**
 * Workflow-state-driven approval proposal enrichment.
 *
 * Instead of relying on the LLM to emit an approval proposal in its JSON (unreliable),
 * this function looks at the ACTUAL tool execution history to determine where we are
 * in the git-to-PR workflow and what the next confirmation step should be.
 *
 * Priority:
 *   1. If the LLM correctly emitted an approval proposal → use it as-is (respect LLM intent)
 *   2. If the response is asking for confirmation → derive from explicit action intent
 *   3. If this is clearly a PR workflow → infer the next PR workflow action
 *   3. Otherwise → no approval proposal
 */
export function deriveWorkflowPendingAction(
  _sessionId: string,
  result: ChatPlannerResult,
  bubbles: StoredBubble[],
): ChatPlannerResult {
  // If LLM correctly provided an approval proposal, trust it
  if (approvalProposalFromResult(result)?.tool) return result;

  // Only infer when the response clearly asks the user to confirm an action
  const response = result.response.toLowerCase();
  const isAskingConfirmation =
    response.includes("shall i") || response.includes("should i") ||
    response.includes("do you want me to") || response.includes("would you like") ||
    response.includes("proceed?") || response.includes("shall i proceed") ||
    response.includes("ready to") || response.includes("want me to");
  if (!isAskingConfirmation) return result;

  const explicitTool = inferWriteToolFromResponse(response);
  if (explicitTool) return withDerivedAction(result, explicitTool, bubbles);

  const nextPrTool = inferNextPrWorkflowTool(response, bubbles);
  if (nextPrTool) return withDerivedAction(result, nextPrTool, bubbles);

  return result;  // all steps done, no approval proposal needed
}

/**
 * Fallback used by confirmAction when no approval proposal is stored.
 * This can happen if the session was reloaded or store was not updated.
 * Uses workflow-state detection from execution history.
 */
export function inferPendingAction(messages: ChatMessage[]): PendingToolAction | undefined {
  // Only used as last-resort in confirmAction — the primary path is deriveWorkflowPendingAction
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return undefined;
  const t = lastAssistant.content.toLowerCase();

  const isAskingConfirmation =
    t.includes("shall i") || t.includes("should i") || t.includes("do you want me to") ||
    t.includes("would you like me to") || t.includes("shall i proceed") ||
    t.includes("ready to") || t.includes("want me to");
  if (!isAskingConfirmation) return undefined;

  const tool = inferWriteToolFromResponse(t) ?? inferNextPrWorkflowTool(t, []);
  return tool ? buildPendingAction(tool, lastAssistant.content, []) : undefined;
}

function withDerivedAction(
  result: ChatPlannerResult,
  tool: string,
  bubbles: StoredBubble[],
): ChatPlannerResult {
  return {
    ...result,
    approvalProposal: buildPendingAction(tool, result.response, bubbles),
  };
}

function buildPendingAction(
  tool: string,
  response: string,
  bubbles: StoredBubble[],
): PendingToolAction {
  const deriver = ACTION_DERIVERS.find((entry) => entry.tool === tool);
  if (!deriver) {
    return { tool, args: {}, description: tool, nextHint: "continue workflow" };
  }
  return {
    tool: deriver.tool,
    args: deriver.buildArgs(response, bubbles),
    description: deriver.description,
    nextHint: deriver.nextHint,
  };
}

function inferWriteToolFromResponse(response: string): string | undefined {
  if (/\b(create|open|raise).{0,20}\b(pull request|pr)\b/.test(response)) return "ado_create_pr";
  if (/\b(rebase)\b/.test(response)) return "git_rebase";
  if (/\bmerge\b/.test(response)) return "git_merge";
  if (/\bpull\b/.test(response) && !/\bpull request\b/.test(response)) return "git_pull";
  if (/\b(restore|discard|revert file|unstage)\b/.test(response) && extractMentionedPaths(response).length > 0) return "git_restore";
  if (/\b(stash|shelve)\b/.test(response)) return "git_stash";
  if (/\b(create).{0,20}\bbranch\b|\bnew branch\b/.test(response)) return "git_create_branch";
  if (/\b(checkout|switch).{0,20}\b(branch|to)\b/.test(response)) return "git_checkout";
  if (/\b(stage|git add|add all)\b/.test(response)) return "git_add";
  if (/\bcommit\b/.test(response)) return "git_commit";
  if (/\bpush\b/.test(response)) return "git_push";
  return undefined;
}

function inferNextPrWorkflowTool(response: string, bubbles: StoredBubble[]): string | undefined {
  const prWorkflow = /\b(pr|pull request|commit|push|stage|staged|branch)\b/.test(response) ||
    bubbles.some((b) => ["git_add", "git_commit", "git_push", "ado_create_pr"].includes(b.toolName ?? ""));
  if (!prWorkflow) return undefined;

  const executedTools = new Set(
    bubbles.filter((b) => b.role === "tool" && b.toolOk === true).map((b) => b.toolName ?? ""),
  );
  if (!executedTools.has("git_add")) return "git_add";
  if (!executedTools.has("git_commit")) return "git_commit";
  if (!executedTools.has("git_push")) return "git_push";
  if (!executedTools.has("ado_create_pr")) return "ado_create_pr";
  return undefined;
}

function currentBranchFromBubbles(bubbles: StoredBubble[]): string {
  // Primary: look for an explicit git_current_branch tool result
  const branchBubble = [...bubbles].reverse().find((b) => b.toolName === "git_current_branch");
  const raw = branchBubble?.toolResult;
  if (typeof raw === "object" && raw !== null && "stdout" in raw) {
    const branch = String((raw as Record<string, unknown>).stdout).trim();
    if (branch && branch !== "HEAD") return branch;
  }

  // Fallback 1: extract from the most recent successful git_push args
  const pushBubble = [...bubbles].reverse().find(
    (b) => b.toolName === "git_push" && b.toolOk !== false && b.toolArgs,
  );
  if (pushBubble?.toolArgs && "branch" in pushBubble.toolArgs) {
    const branch = String(pushBubble.toolArgs.branch ?? "").trim();
    if (branch && branch !== "HEAD") return branch;
  }

  // Fallback 2: extract from the most recent git_create_branch or git_checkout args
  const switchBubble = [...bubbles].reverse().find(
    (b) => (b.toolName === "git_create_branch" || b.toolName === "git_checkout") && b.toolArgs,
  );
  if (switchBubble?.toolArgs) {
    const ref = String(switchBubble.toolArgs["name"] ?? switchBubble.toolArgs["ref"] ?? "").trim();
    if (ref && ref !== "HEAD") return ref;
  }

  return "HEAD";
}

function extractBranchName(response: string): string | undefined {
  return response.match(/\b(?:branch\s+(?:named|called)?|named|called)\s+["'`]?([A-Za-z0-9._/-]{3,80})["'`]?/i)?.[1];
}

function extractGitRef(response: string): string | undefined {
  const patterns = [
    /\b(?:checkout|switch)\s+(?:to\s+)?(?:branch\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\brebase\s+(?:onto\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\bmerge\s+(?:into\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\bpull\s+["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\b(?:onto|into|from|to|branch|ref)\s+["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\b(origin\/[A-Za-z0-9._/-]{2,100})\b/i,
  ];
  for (const pattern of patterns) {
    const match = response.match(pattern)?.[1];
    if (match) return match.replace(/[.,;:)]+$/, "");
  }
  return undefined;
}

function extractMentionedPaths(response: string): string[] {
  const matches = response.match(/(?:[\w.-]+\/)+[\w.-]+|[\w.-]+\.(?:tsx|ts|jsx|json|js|yaml|yml|scss|css|html|lock|md|py|cs|go|rs|java|kt|sql)/g) ?? [];
  return [...new Set(matches)].slice(0, 20);
}
