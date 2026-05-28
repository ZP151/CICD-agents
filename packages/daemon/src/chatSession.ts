import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ChatPlanner,
  LLMClient,
  getSettings,
  ToolExecutor,
  isConfirmationMessage,
  isDenialMessage,
  getWorkspaceProfile,
  profileToToolExtra,
  type ChatEvent,
  type ChatMessage,
  type ChatPlannerResult,
  type PendingToolAction,
  type ToolContext,
  type Settings,
  azureDevOpsTools,
  dotnetTools,
  gitTools,
  gitIntentTool,
  npmTools,
  pytestTools,
  CosmosSessionStore,
  resetCosmosClient,
  type CosmosStoredSession,
} from "@cicd-agent/core";
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
  pendingAction?: PendingToolAction; // last write-action the agent proposed, awaiting "yes"
  llmConfig?: InlineLlmConfig;    // persisted so confirm-action can reuse the same creds
  inlineProfile?: InlineProfile;  // persisted so confirm-action has ADO/profile context
}

type HistoryStore = Record<string, StoredSession>;

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
    } catch {
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
    } catch {
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
    pendingAction: doc.pendingAction as PendingToolAction | undefined,
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
    pendingAction: s.pendingAction,
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
    azureOpenAiEndpoint:        isAzure ? (override.azureEndpoint   ?? base.azureOpenAiEndpoint)        : base.azureOpenAiEndpoint,
    azureOpenAiApiKey:          isAzure ? (override.azureApiKey     ?? base.azureOpenAiApiKey)          : base.azureOpenAiApiKey,
    azureOpenAiChatDeployment:  isAzure ? (override.azureDeployment ?? base.azureOpenAiChatDeployment)  : base.azureOpenAiChatDeployment,
    azureOpenAiApiVersion:      isAzure ? (override.azureApiVersion ?? base.azureOpenAiApiVersion)      : base.azureOpenAiApiVersion,
    llmConfigured: isAzure
      ? Boolean(
          (override.azureEndpoint ?? base.azureOpenAiEndpoint) &&
          (override.azureApiKey   ?? base.azureOpenAiApiKey),
        )
      : Boolean(override.openaiApiKey ?? base.azureOpenAiApiKey),
  };
}

// ─── ChatSessionManager ───────────────────────────────────────────────────────

export class ChatSessionManager {
  private readonly active = new Map<string, ActiveSession>();

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
    session.repoPath = repoPath;

    // Update repoPath, profileId, llmConfig, and inlineProfile in store.
    // Persisting these lets confirm-action reuse the same credentials and
    // ADO context without the frontend needing to re-send them.
    {
      const storedSession = await loadSession(sessionId);
      if (storedSession) {
        storedSession.repoPath = repoPath;
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
      profileExtra = profileToToolExtra(inlineProfile as Parameters<typeof profileToToolExtra>[0]);
    } else {
      const storedForProfile = await loadSession(sessionId);
      const resolvedProfileId = profileId ?? storedForProfile?.profileId;
      if (resolvedProfileId) {
        const p = getWorkspaceProfile(getSettings().dataDir, resolvedProfileId);
        if (p) profileExtra = profileToToolExtra(p);
      }
    }

    // ── Build shared tools/executor (needed for both paths) ─────────────────
    const toolCtx: ToolContext = {
      repoPath: session.repoPath,
      env: {},
      timeoutSec: 60,
      extra: profileExtra,
    };
    const executor = new ToolExecutor(toolCtx);
    executor.registerMany([
      ...gitTools(),
      ...dotnetTools(),
      ...npmTools(),
      ...pytestTools(),
      ...azureDevOpsTools(),
      gitIntentTool(),
    ]);
    const effectiveSettings = buildEffectiveSettings(llmConfig);
    const llm = new LLMClient(effectiveSettings);
    const planner = new ChatPlanner(llm, executor);
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
        // If no stored pending action, attempt to infer one from the last assistant message
        const pending = storedSession?.pendingAction
          ?? (isConfirmationMessage(message) ? inferPendingAction(storedSession?.messages ?? []) : undefined);

        if (pending) {
          if (isDenialMessage(message)) {
            // User cancelled — clear pending action and acknowledge
            if (storedSession) {
              storedSession.pendingAction = undefined;
              await saveSession(storedSession);
            }
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
              storedSession.pendingAction = undefined;
              await saveSession(storedSession);
            }

            // ── Execute the tool directly — no LLM round trip ───────────────
            yield { type: "tool_start", name: pending.tool, args: pending.args };
            let toolResult: unknown;
            let ok = true;
            try {
              toolResult = await executor.call(pending.tool, pending.args);
            } catch (err) {
              ok = false;
              toolResult = { error: err instanceof Error ? err.message : String(err) };
            }
            const summary = truncateStr(JSON.stringify(toolResult), 300);
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

            yield* this._runPlannerAndPersist(
              sessionId, continuationMsg, history22, session.repoPath, planner, waitForConfirm,
            );
            return;
          }
        }
      }

      // ── Normal LLM flow ────────────────────────────────────────────────────
      const history = await this.getHistory(sessionId, 20);
      yield* this._runPlannerAndPersist(
        sessionId, message, history, session.repoPath, planner, waitForConfirm,
      );
    } finally {
      // Always clean up the active entry — even if the server force-closes the generator
      this.active.delete(sessionId);
    }
  }

  /**
   * Directly execute the session's stored pendingAction (invoked by the
   * dedicated /confirm-action endpoint — not via a chat message).
   * After execution, asks the LLM for the NEXT single workflow step only
   * (no re-running of read tools).
   */
  async *confirmAction(sessionId: string): AsyncGenerator<ChatEvent> {
    // Load pending action — use heuristic fallback if LLM omitted the JSON field
    const storedSession = await loadSession(sessionId);
    const pending = storedSession?.pendingAction
      ?? inferPendingAction(storedSession?.messages ?? []);

    if (!pending || !storedSession) {
      yield { type: "error", message: "No pending action for this session" };
      return;
    }

    // Register as active (prevents duplicate runs; try/finally guarantees cleanup)
    this.active.set(sessionId, {
      repoPath: storedSession.repoPath,
      confirmResolver: null,
      abortController: new AbortController(),
    });

    try {
      // Clear pending action immediately so a double-click can't re-trigger
      storedSession.pendingAction = undefined;
      await saveSession(storedSession);

      const session = this.active.get(sessionId)!;

      // Build executor — prefer the persisted inline profile (sent from the
      // frontend localStorage on the original /chat request) so that ADO org,
      // project, repo, and PAT are available without a daemon-side DB lookup.
      const profileExtra: Record<string, unknown> = storedSession.inlineProfile
        ? profileToToolExtra(storedSession.inlineProfile as Parameters<typeof profileToToolExtra>[0])
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
      const executor = new ToolExecutor(toolCtx);
      executor.registerMany([
        ...gitTools(),
        ...dotnetTools(),
        ...npmTools(),
        ...pytestTools(),
        ...azureDevOpsTools(),
        gitIntentTool(),
      ]);
      // Reuse the LLM config that was persisted when the session's last /chat
      // request ran — this ensures confirm-action works without the frontend
      // having to re-send credentials.
      const effectiveSettings = buildEffectiveSettings(storedSession.llmConfig);
      const llm = new LLMClient(effectiveSettings);
      const planner = new ChatPlanner(llm, executor);

      // ── Execute the confirmed tool ─────────────────────────────────────────
      yield { type: "tool_start", name: pending.tool, args: pending.args };
      let toolResult: unknown;
      let ok = true;
      try {
        toolResult = await executor.call(pending.tool, pending.args);
      } catch (err) {
        ok = false;
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }
      const summary = truncateStr(JSON.stringify(toolResult), 300);
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
          `If the next step requires user confirmation (commit/push/PR), propose it with pending_action in your JSON.`
        : `WORKFLOW STEP FAILED: ${pending.tool} failed with error: ${summary}. Explain what went wrong and propose a recovery action.`;

      await this.appendMessage(sessionId, "user", continuationMsg);
      const history = await this.getHistory(sessionId, 22);

      yield* this._runPlannerAndPersist(
        sessionId, continuationMsg, history, session.repoPath, planner, () => Promise.resolve(true),
      );
    } finally {
      this.active.delete(sessionId);
    }
  }

  /** Run the ChatPlanner, persist events, and save pendingAction from result. */
  private async *_runPlannerAndPersist(
    sessionId: string,
    message: string,
    history: ChatMessage[],
    repoPath: string,
    planner: ChatPlanner,
    waitForConfirm: () => Promise<boolean>,
  ): AsyncGenerator<ChatEvent> {
    let assistantReply = "";
    const pendingToolArgs = new Map<string, Record<string, unknown>>();

    for await (const event of planner.run(message, history, repoPath, waitForConfirm)) {
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
        });
        yield event;
      } else if (event.type === "done") {
        // ── Workflow-state enrichment ──────────────────────────────────────
        const bubbles = await this.getBubbles(sessionId);
        const enrichedResult = deriveWorkflowPendingAction(sessionId, event.result, bubbles);
        const enrichedEvent: ChatEvent = { type: "done", result: enrichedResult };

        assistantReply = enrichedResult.response;
        await this.appendBubble(sessionId, {
          role: "assistant",
          content: enrichedResult.response,
          timestamp: now(),
          riskLevel: enrichedResult.riskLevel,
          actionsTaken: enrichedResult.actionsTaken,
          suggestions: enrichedResult.suggestions,
        });
        // Store the enriched pendingAction
        const storedForPending = await loadSession(sessionId);
        if (storedForPending) {
          storedForPending.pendingAction = enrichedResult.pendingAction ?? undefined;
          await saveSession(storedForPending);
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
      } else {
        yield event;
      }
    }

    if (assistantReply) {
      await this.appendMessage(sessionId, "assistant", assistantReply);
    }
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

// ── Git-to-PR workflow steps (ordered) ───────────────────────────────────────
const WORKFLOW_STEPS: Array<{
  tool: string;
  description: string;
  nextHint: string;
  /** Build args from session bubble history */
  buildArgs: (bubbles: StoredBubble[]) => Record<string, unknown>;
}> = [
  {
    tool: "git_add",
    description: "Stage all changes",
    nextHint: "commit staged changes",
    buildArgs: () => ({}),  // stage everything
  },
  {
    tool: "git_commit",
    description: "Commit staged changes",
    nextHint: "push branch",
    buildArgs: (bubbles) => {
      // Extract commit message proposed by the LLM from the last assistant bubble
      const last = [...bubbles].reverse().find((b) => b.role === "assistant");
      const text = last?.content ?? "";
      // Look for quoted message in the assistant response
      const quoted = text.match(/["'`]([^"'`\n]{10,120})["'`]/)?.[1];
      // Or a line starting with "feat/fix/chore/docs/refactor:"
      const conventional = text.match(/\b(feat|fix|chore|docs|refactor|style|test|ci|build|perf)(\([^)]+\))?:\s*(.+)/i)?.[0];
      const message = quoted ?? conventional ?? "feat: update changes";
      return { message: message.trim() };
    },
  },
  {
    tool: "git_push",
    description: "Push branch to remote",
    nextHint: "create PR",
    buildArgs: (bubbles) => {
      // Use the branch name from git_current_branch result
      const branchBubble = [...bubbles].reverse().find((b) => b.toolName === "git_current_branch");
      const raw = branchBubble?.toolResult;
      const branch = typeof raw === "object" && raw !== null && "stdout" in raw
        ? String((raw as Record<string, unknown>).stdout).trim()
        : "HEAD";
      return { branch };
    },
  },
  {
    tool: "ado_create_pr",
    description: "Create pull request",
    nextHint: "done",
    buildArgs: (bubbles) => {
      // Extract source branch
      const branchBubble = [...bubbles].reverse().find((b) => b.toolName === "git_current_branch");
      const raw = branchBubble?.toolResult;
      const source_branch = typeof raw === "object" && raw !== null && "stdout" in raw
        ? String((raw as Record<string, unknown>).stdout).trim()
        : "HEAD";
      // Extract PR title/description from last assistant bubble
      const last = [...bubbles].reverse().find((b) => b.role === "assistant");
      const text = last?.content ?? "";
      const titleMatch = text.match(/(?:title|PR title|pull request title)[:\s]+["']?([^\n"']{5,100})["']?/i);
      const title = titleMatch?.[1] ?? `Update from ${source_branch}`;
      return { source_branch, title, description: text.slice(0, 300) };
    },
  },
];

/**
 * Workflow-state-driven pending action enrichment.
 *
 * Instead of relying on the LLM to emit pending_action in its JSON (unreliable),
 * this function looks at the ACTUAL tool execution history to determine where we are
 * in the git-to-PR workflow and what the next confirmation step should be.
 *
 * Priority:
 *   1. If the LLM correctly emitted pending_action → use it as-is (respect LLM intent)
 *   2. If the response is asking for confirmation → derive from workflow stage
 *   3. Otherwise → no pending action
 */
function deriveWorkflowPendingAction(
  _sessionId: string,
  result: ChatPlannerResult,
  bubbles: StoredBubble[],
): ChatPlannerResult {
  // If LLM correctly provided pending_action, trust it
  if (result.pendingAction?.tool) return result;

  // Only infer when the response clearly asks the user to confirm an action
  const response = result.response.toLowerCase();
  const isAskingConfirmation =
    response.includes("shall i") || response.includes("should i") ||
    response.includes("do you want me to") || response.includes("would you like") ||
    response.includes("proceed?") || response.includes("shall i proceed") ||
    response.includes("ready to") || response.includes("want me to");
  if (!isAskingConfirmation) return result;

  const executedTools = new Set(
    bubbles.filter((b) => b.role === "tool" && b.toolOk === true).map((b) => b.toolName ?? ""),
  );

  // Walk the workflow steps and find the first one not yet completed
  for (const step of WORKFLOW_STEPS) {
    if (!executedTools.has(step.tool)) {
      const args = step.buildArgs(bubbles);
      return {
        ...result,
        pendingAction: {
          tool: step.tool,
          args,
          description: step.description,
          nextHint: step.nextHint,
        },
      };
    }
  }

  return result;  // all steps done, no pending action needed
}

/**
 * Fallback used by confirmAction when no pendingAction is stored.
 * This can happen if the session was reloaded or store was not updated.
 * Uses workflow-state detection from execution history.
 */
function inferPendingAction(messages: ChatMessage[]): PendingToolAction | undefined {
  // Only used as last-resort in confirmAction — the primary path is deriveWorkflowPendingAction
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return undefined;
  const t = lastAssistant.content.toLowerCase();

  const isAskingConfirmation =
    t.includes("shall i") || t.includes("should i") || t.includes("do you want me to") ||
    t.includes("would you like me to") || t.includes("shall i proceed") ||
    t.includes("ready to") || t.includes("want me to");
  if (!isAskingConfirmation) return undefined;

  if (t.includes("stage") || t.includes("git add") || t.includes("add all")) {
    return { tool: "git_add", args: {}, description: "Stage all changes", nextHint: "commit staged changes" };
  }
  if (t.includes("commit")) {
    const msgMatch = t.match(/["']([^"']{5,80})["']/);
    return { tool: "git_commit", args: { message: msgMatch?.[1] ?? "feat: update" }, description: "Commit staged changes", nextHint: "push branch" };
  }
  if (t.includes("push")) {
    return { tool: "git_push", args: { branch: "HEAD" }, description: "Push branch to remote", nextHint: "create PR" };
  }
  if (t.includes("pull request") || t.includes(" pr ") || t.includes("create pr")) {
    return { tool: "ado_create_pr", args: {}, description: "Create pull request", nextHint: "done" };
  }
  return undefined;
}
