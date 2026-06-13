import {
  listReviewHistoryLocal,
  mergeReviewQueueItems,
  syncReviewHistoryLocal,
  upsertReviewHistoryLocal,
  type ReviewHistoryRecord,
} from "./reviewHistoryLocal.js";
import {
  appendReviewOperation,
  listReviewOperations,
  type ReviewOperationEvent,
} from "./reviewOperations.js";

// Daemon base URL.  In dev (Vite / tauri dev) this is always port 8787.
// In a packaged release it is also 8787 – using a single consistent port
// avoids the async bootstrapping problem that caused the frontend to connect
// to the wrong port before the Rust backend had a chance to report it.
// Override with VITE_RUNTIME_URL if you need a non-default address.
const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL ?? "http://127.0.0.1:8787";

function messageFromErrorBody(fallback: string, body: string): string {
  try {
    const json = JSON.parse(body) as { authMessage?: string; message?: string; error?: string };
    return explainRuntimeError(json.authMessage ?? json.message ?? json.error ?? fallback);
  } catch {
    return explainRuntimeError(body || fallback);
  }
}

function explainRuntimeError(message: string): string {
  if (/deployment.*does not exist/i.test(message)) {
    const envSource = message.match(/Daemon env source:\s*([^.]*)\./i)?.[1]?.trim();
    const deployment = message.match(/Deployment:\s*([^.]*)\./i)?.[1]?.trim();
    const details = [
      envSource ? `Daemon env source: ${envSource}.` : "",
      deployment ? `Deployment: ${deployment}.` : "",
    ].filter(Boolean).join(" ");
    return `Azure OpenAI deployment not found. ${details} Check Settings -> Additional Models deployment name, endpoint, and API version, or restart the daemon after fixing the .env file.`.trim();
  }
  return message;
}

export interface HealthStatus {
  ok: boolean;
  uptimeSec?: number;
  llmConfigured?: boolean;
  llmProvider?: "azure" | "openai";
  envSource?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  azureEndpoint?: string;
  azureDeploymentAvailable?: boolean;
  azureDeploymentError?: string;
  cloudProfileStore?: boolean;
  cloudSecrets?: boolean;
  cloudSessions?: boolean;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const r = await fetch(`${RUNTIME_URL}/healthz`);
  if (!r.ok) throw new Error(`/healthz HTTP ${r.status}`);
  return r.json() as Promise<HealthStatus>;
}

export interface TaskView {
  id: string;
  kind: string;
  status: string;
  payload?: Record<string, unknown>;
  steps: Array<{ seq: number; name: string; detail: string; status: string; createdAt: number }>;
  result: unknown;
  error: string;
  createdAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export async function fetchTasks(): Promise<TaskView[]> {
  const r = await fetch(`${RUNTIME_URL}/tasks`);
  if (!r.ok) throw new Error(`/tasks HTTP ${r.status}`);
  return (await r.json()) as TaskView[];
}

export async function fetchTask(taskId: string): Promise<TaskView> {
  const r = await fetch(`${RUNTIME_URL}/tasks/${taskId}`);
  if (!r.ok) throw new Error(`/tasks/${taskId} HTTP ${r.status}`);
  return (await r.json()) as TaskView;
}

export function streamTask(
  taskId: string,
  onEvent: (type: string, data: unknown) => void,
): () => void {
  const url = `${RUNTIME_URL}/tasks/${taskId}/events`;
  const es = new EventSource(url);
  const handler = (event: MessageEvent): void => {
    try {
      onEvent(event.type || "message", JSON.parse(event.data));
    } catch {
      onEvent(event.type || "message", event.data);
    }
  };
  ["step", "status", "done", "error"].forEach((name) => es.addEventListener(name, handler));
  return () => es.close();
}

export async function submitPipeline(payload: Record<string, unknown>): Promise<{ taskId: string }> {
  const r = await fetch(`${RUNTIME_URL}/tasks/submit-pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`/tasks/submit-pipeline HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as { taskId: string };
}

export const runtimeUrl = RUNTIME_URL;

// ─── Chat API ─────────────────────────────────────────────────────────────────

export type ChatEventType =
  | "session"
  | "session.started"
  | "assistant_delta"
  | "text.delta"
  | "progress"
  | "tool_start"
  | "tool.started"
  | "tool_output_delta"
  | "tool.output.delta"
  | "tool_end"
  | "tool.completed"
  | "assistant_control"
  | "assistant.control"
  | "confirm_required"
  | "workflow_state"
  | "workflow.updated"
  | "approval_required"
  | "approval.required"
  | "approval_resolved"
  | "approval.resolved"
  | "executing"
  | "message"
  | "done"
  | "final"
  | "ui.chunk"
  | "error"
  | "cancelled";

export type ChatUiChunk =
  | { type: "start" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "progress"; message: string }
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool-output-delta"; toolCallId: string; toolName: string; stream: "stdout" | "stderr"; delta: string }
  | { type: "tool-output-available"; toolCallId: string; toolName: string; output: unknown; summary: string }
  | { type: "tool-output-error"; toolCallId: string; toolName: string; errorText: string; summary: string }
  | { type: "approval-required"; approval: unknown }
  | { type: "approval-resolved"; approvalId: string; approved: boolean }
  | { type: "metadata-available"; metadata: unknown }
  | { type: "workflow-updated"; state: unknown }
  | { type: "finish"; finishReason: "stop" | "cancelled" | "error" }
  | { type: "error"; errorText: string };

export interface ChatEventPayload {
  type: ChatEventType;
  uiChunk?: ChatUiChunk;
  // session
  sessionId?: string;
  legacyType?: string;
  // assistant_delta
  delta?: string;
  // tool_start / tool_end
  toolCallId?: string;
  name?: string;
  args?: Record<string, unknown>;
  stream?: "stdout" | "stderr";
  ok?: boolean;
  summary?: string;
  toolResult?: unknown;  // structured tool output for renderers
  // confirm_required
  riskLevel?: string;
  plan?: string;
  approval?: {
    id: string;
    action: {
      tool: string;
      args: Record<string, unknown>;
      description: string;
      nextHint?: string;
    };
    riskLevel: string;
    explanation: string;
  };
  approvalId?: string;
  approved?: boolean;
  state?: {
    status: "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";
    currentStep: string;
    completedTools: string[];
    pendingApproval?: ChatEventPayload["approval"];
  };
  // message / error
  text?: string;
  message?: string;
  // done
  result?: {
    response: string;
    streamedResponse?: string;
    finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
    riskLevel: string;
    actionsTaken: string[];
    suggestions: string[];
    sources?: ChatSource[];
    artifacts?: ChatArtifact[];
  };
}

export interface ChatArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

export type ChatSource =
  | {
      type: "source_document";
      sourceId?: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId?: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    };

export interface ChatHistoryEntry {
  sessionId: string;
  preview: string;
  createdAt: number;
}

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

export interface ChatCheckpointPreview {
  ok: boolean;
  checkpointId: string;
  path: string;
  createdAt: string;
  repoPath: string;
  reason: string;
  branch: string;
  head: string;
  statusLines: string[];
  files: string[];
  diffPreview: string;
  diffChars: number;
  diffTruncated: boolean;
}

export interface ChatCheckpointRollbackPlan {
  ok: boolean;
  checkpointId: string;
  repoPath: string;
  branch: string;
  head: string;
  supported: boolean;
  mode: "apply_checkpoint_patch" | "already_at_checkpoint" | "restore_tracked_to_clean_checkpoint" | "untracked_only";
  reason: string;
  checkpointFiles: string[];
  currentStatusLines: string[];
  currentTrackedPaths: string[];
  currentUntrackedPaths: string[];
  requiredCapability?: string;
  proposal: null | {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    nextHint?: string;
  };
  warnings: string[];
}

export interface ChatMessageEntry {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  riskLevel?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  actionsTaken?: string[];
  suggestions?: string[];
  sources?: ChatSource[];
  artifacts?: ChatArtifact[];
}

export type ChatWorkflowState = NonNullable<ChatEventPayload["state"]>;

export type ChatWorkflowAction =
  | "inspect_environment"
  | "inspect_changes"
  | "refresh_branch"
  | "checkout_branch"
  | "create_branch"
  | "push_branch"
  | "prepare_commit"
  | "run_tests"
  | "run_build"
  | "stage_resolved_conflicts"
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
  | "skip_revert"
  | "create_pr"
  | "inspect_pr_insight"
  | "check_pr_policy"
  | "list_pr_work_items"
  | "link_work_item";

export interface ChatWorkflowActionInput {
  sessionId?: string | null;
  pullRequestId?: number;
  workItemId?: number;
  branch?: string;
  targetBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
  message?: string;
  paths?: string[];
  includeUnstaged?: boolean;
  commitMode?: "commit" | "commit-push";
  validationScript?: string;
  validationArgs?: string[];
}

export interface ChatWorkflowToolResult {
  name: string;
  command: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  returncode: number;
}

export interface ChatWorkflowActionResult {
  ok: boolean;
  action: ChatWorkflowAction;
  sessionId?: string;
  repoPath: string;
  summary: string;
  workflowState: ChatWorkflowState;
  tools: ChatWorkflowToolResult[];
}

export interface ChatIndexStatus {
  repoPath: string;
  indexed: boolean;
  semanticReady: boolean;
  retrievalMode: "semantic-index" | "quick-scan";
  stats: {
    filesIndexed: number;
    chunksIndexed: number;
    chunksEmbedded: number;
    chunksPendingEmbedding: number;
  };
  summary: string;
}

export interface ChatIndexRefreshResult {
  ok: boolean;
  refresh: {
    filesSeen: number;
    filesIndexed: number;
    embedded: number;
  };
  status: ChatIndexStatus;
}

// ─── localStorage config readers ─────────────────────────────────────────────
type ConversationModelChoice = "built_in" | "custom";

// Read at call time so any changes the user makes in Settings / Profiles are
// picked up immediately without a page reload.
function readLlmConfig(conversationModelChoice: ConversationModelChoice = "built_in"): Record<string, unknown> | undefined {
  try {
    if (conversationModelChoice !== "custom") return undefined;

    const raw = localStorage.getItem("dev_agent_settings");
    if (!raw) return undefined;
    const s = JSON.parse(raw) as Record<string, unknown>;
    // Settings stores optional user-provided API candidates. Conversation uses
    // the built-in model by default and must explicitly choose the custom model
    // before we send these fields to the daemon.
    const provider = s["llmProvider"] === "openai" ? "openai" : "azure";
    const hasAzureCustomModel = Boolean(s["azureEndpoint"] && s["azureApiKey"] && s["azureDeployment"]);
    const hasOpenAiCustomModel = Boolean(s["openaiApiKey"] && s["openaiModel"]);
    if (provider === "azure" && !hasAzureCustomModel) return undefined;
    if (provider === "openai" && !hasOpenAiCustomModel) return undefined;

    // Only include fields the daemon understands; omit empty strings.
    const config: Record<string, unknown> = {};
    config["llmProvider"] = provider;
    if (s["azureEndpoint"]) config["azureEndpoint"] = s["azureEndpoint"];
    if (s["azureApiKey"]) config["azureApiKey"] = s["azureApiKey"];
    if (s["azureDeployment"]) config["azureDeployment"] = s["azureDeployment"];
    if (s["azureApiVersion"]) config["azureApiVersion"] = s["azureApiVersion"];
    if (s["openaiApiKey"]) config["openaiApiKey"] = s["openaiApiKey"];
    if (s["openaiModel"]) config["openaiModel"] = s["openaiModel"];
    return Object.keys(config).length > 0 ? config : undefined;
  } catch { return undefined; }
}

function readProfileData(profileId: string | undefined): Record<string, unknown> | undefined {
  if (!profileId) return undefined;
  try {
    const raw = localStorage.getItem("cicd_agent_profiles_v1");
    if (!raw) return undefined;
    const all = JSON.parse(raw) as Array<Record<string, unknown>>;
    return all.find((p) => p["id"] === profileId);
  } catch { return undefined; }
}

function chatIndexBody(repoPath: string, profileId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { repoPath };
  const llmConfig = readLlmConfig();
  if (llmConfig) body["llmConfig"] = llmConfig;
  const profile = readProfileData(profileId);
  if (profile) body["profile"] = profile;
  return body;
}

export async function fetchChatIndexStatus(repoPath: string, profileId?: string): Promise<ChatIndexStatus> {
  const r = await fetch(`${RUNTIME_URL}/chat/index-status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chatIndexBody(repoPath, profileId)),
  });
  if (!r.ok) throw new Error(`/chat/index-status HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatIndexStatus;
}

export async function refreshChatIndexStatus(repoPath: string, profileId?: string): Promise<ChatIndexRefreshResult> {
  const r = await fetch(`${RUNTIME_URL}/chat/index-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chatIndexBody(repoPath, profileId)),
  });
  if (!r.ok) throw new Error(`/chat/index-refresh HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatIndexRefreshResult;
}

/**
 * POST /chat — streams a conversational turn via SSE.
 * Returns the sessionId (from the first "session" event) and a cancel function.
 */
export function chatStream(
  message: string,
  repoPath: string,
  sessionId: string | null,
  onEvent: (payload: ChatEventPayload) => void,
  profileId?: string,
  conversationModelChoice: ConversationModelChoice = "built_in",
): { cancel: () => void } {
  const controller = new AbortController();

  const body: Record<string, unknown> = { message, repoPath };
  if (sessionId) body["sessionId"] = sessionId;
  if (profileId) body["profileId"] = profileId;

  // Attach LLM config and full profile data so the daemon uses the user's
  // selected conversation model only when they choose an additional provider.
  const llmConfig = readLlmConfig(conversationModelChoice);
  if (llmConfig) body["llmConfig"] = llmConfig;
  const profile = readProfileData(profileId);
  if (profile) body["profile"] = profile;

  fetch(`${RUNTIME_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok || !r.body) {
        const bodyText = await r.text().catch(() => "");
        onEvent({ type: "error", message: messageFromErrorBody(`HTTP ${r.status}`, bodyText) });
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const parsed = JSON.parse(raw) as ChatEventPayload & { result?: unknown; chunk?: ChatUiChunk };
              // For tool_end, the backend sends { type, name, ok, summary, result }
              // Map `result` → `toolResult` to avoid collision with the done `result`
              const toolResult = currentEventType === "tool_end" || currentEventType === "tool.completed"
                ? parsed.result
                : undefined;
              const doneResult = currentEventType === "done" || currentEventType === "final"
                ? (parsed.result as ChatEventPayload["result"])
                : undefined;
              const message = currentEventType === "error" && parsed.message
                ? explainRuntimeError(parsed.message)
                : parsed.message;
              onEvent({
                ...parsed,
                type: (currentEventType as ChatEventType) || parsed.type,
                uiChunk: currentEventType === "ui.chunk" ? parsed.chunk : undefined,
                toolResult,
                result: doneResult,
                message,
              });
            } catch {
              /* ignore malformed lines */
            }
            currentEventType = "message";
          }
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return { cancel: () => controller.abort() };
}

export async function confirmPlan(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm`, { method: "POST" });
  if (!r.ok) throw new Error(`confirm failed: HTTP ${r.status}`);
}

/** Dispatch a structured confirm-action (bypasses chat input and executes the stored approval proposal). */
export function confirmAction(
  sessionId: string,
  onEvent: (payload: ChatEventPayload) => void,
): { cancel: () => void } {
  const controller = new AbortController();

  fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm-action`, {
    method: "POST",
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok || !r.body) {
        const bodyText = await r.text().catch(() => "");
        onEvent({ type: "error", message: messageFromErrorBody(`HTTP ${r.status}`, bodyText) });
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const parsed = JSON.parse(raw) as ChatEventPayload & { result?: unknown; chunk?: ChatUiChunk };
              const toolResult = currentEventType === "tool_end" || currentEventType === "tool.completed"
                ? parsed.result
                : undefined;
              const doneResult = currentEventType === "done" || currentEventType === "final"
                ? (parsed.result as ChatEventPayload["result"])
                : undefined;
              const message = currentEventType === "error" && parsed.message
                ? explainRuntimeError(parsed.message)
                : parsed.message;
              onEvent({
                ...parsed,
                type: (currentEventType as ChatEventType) || parsed.type,
                uiChunk: currentEventType === "ui.chunk" ? parsed.chunk : undefined,
                toolResult,
                result: doneResult,
                message,
              });
            } catch {
              /* ignore malformed lines */
            }
            currentEventType = "message";
          }
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return { cancel: () => controller.abort() };
}

export async function cancelPlan(sessionId: string): Promise<void> {
  await fetch(`${RUNTIME_URL}/chat/${sessionId}/cancel`, { method: "POST" });
}

export async function fetchChatHistory(): Promise<ChatHistoryEntry[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/history`);
  if (!r.ok) throw new Error(`/chat/history HTTP ${r.status}`);
  return (await r.json()) as ChatHistoryEntry[];
}

export async function fetchChatCheckpointActivity(): Promise<ChatCheckpointActivity[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints`);
  if (!r.ok) throw new Error(`/chat/checkpoints HTTP ${r.status}`);
  return (await r.json()) as ChatCheckpointActivity[];
}

export async function fetchChatCheckpointPreview(
  checkpointId: string,
  maxDiffChars = 12000,
): Promise<ChatCheckpointPreview> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints/${encodeURIComponent(checkpointId)}/preview?maxDiffChars=${maxDiffChars}`);
  if (!r.ok) throw new Error(`/chat/checkpoints/${checkpointId}/preview HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatCheckpointPreview;
}

export async function fetchChatCheckpointRollbackPlan(
  checkpointId: string,
): Promise<ChatCheckpointRollbackPlan> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints/${encodeURIComponent(checkpointId)}/rollback-plan`);
  if (!r.ok) throw new Error(`/chat/checkpoints/${checkpointId}/rollback-plan HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatCheckpointRollbackPlan;
}

export async function fetchChatMessages(sessionId: string): Promise<ChatMessageEntry[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/messages`);
  if (!r.ok) throw new Error(`/chat/messages HTTP ${r.status}`);
  return (await r.json()) as ChatMessageEntry[];
}

export async function fetchChatState(sessionId: string): Promise<{ workflowState?: ChatWorkflowState }> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/state`);
  if (!r.ok) throw new Error(`/chat/state HTTP ${r.status}`);
  return (await r.json()) as { workflowState?: ChatWorkflowState };
}

export async function runChatWorkflowAction(
  action: ChatWorkflowAction,
  repoPath: string,
  profileId?: string | null,
  input?: ChatWorkflowActionInput,
): Promise<ChatWorkflowActionResult> {
  const profile = readProfileData(profileId ?? undefined);
  const r = await fetch(`${RUNTIME_URL}/chat/workflow-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      repoPath,
      profileId,
      ...(input ?? {}),
      ...(profile ? { profile } : {}),
    }),
  });
  if (!r.ok) throw new Error(`/chat/workflow-action HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatWorkflowActionResult;
}

// ─── Workspace profile API ────────────────────────────────────────────────────

export interface WorkspaceProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  repoPath: string;
  defaultBranch: string;
  targetBranch: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  adoPat: string;
  adoPipelineId: string;
  adoPipelineName: string;
  adoMcpEnabled: boolean;
  adoMcpCommand: string;
  adoMcpAuthentication: string;
  adoMcpDomains: string;
  templateProfile: string;
  buildCommand: string;
  testCommand: string;
}

export type WorkspaceProfileInput = Omit<WorkspaceProfile, "id" | "createdAt" | "updatedAt">;
export type ProjectLink = WorkspaceProfile;
export type ProjectLinkInput = WorkspaceProfileInput;

export type AdoDiscoveryKind = "projects" | "repositories" | "pipelines";

export interface AdoDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface AdoDiscoveryResult {
  source: "internal" | "mcp";
  kind: AdoDiscoveryKind;
  items: AdoDiscoveryOption[];
  authMode?: "oauth" | "pat";
  authStatus?: "ok" | "oauth_unavailable" | "oauth_no_org_access" | "pat_invalid_or_missing_scope" | "unknown_error";
  authMessage?: string;
  retryable?: boolean;
}

export interface AdoMcpCheckResult {
  ok: boolean;
  source: "internal" | "mcp";
  authMode?: "oauth" | "pat";
  authStatus?: "ok" | "oauth_unavailable" | "oauth_no_org_access" | "pat_invalid_or_missing_scope" | "unknown_error";
  authMessage?: string;
  retryable?: boolean;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  projectCount?: number;
}

export interface PipelineRunSummary {
  id: number;
  name: string;
  state: string;
  result: string;
  createdDate: string;
  finishedDate: string;
  sourceBranch: string;
  url: string;
}

export interface PullRequestSummary {
  id: number;
  title: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdBy: string;
  creationDate: string;
  repository: string;
  url: string;
  reviewerCount: number;
  voteSummary: {
    approved: number;
    waiting: number;
    rejected: number;
  };
  pipelineRun?: PipelineRunSummary;
}

export interface PullRequestThreadSummary {
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  status: string | number;
  comments: Array<{
    id: number;
    author: {
      displayName: string;
      uniqueName: string;
    };
    content: string;
    publishedDate: string;
    lastUpdatedDate: string;
    lastContentUpdatedDate: string;
  }>;
  threadContext: unknown;
}

export interface BuildSummary {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime: string;
  startTime: string;
  finishTime: string;
  sourceBranch: string;
  sourceVersion: string;
  definitionName: string;
  repository: string;
  requestedFor: string;
  url: string;
}

export interface PullRequestChangesSummary {
  iterationId: number;
  sourceCommit: string;
  targetCommit: string;
  commonCommit: string;
  fileCount: number;
  changes: Array<{
    changeId: number;
    changeType: string | number;
    path: string;
    originalPath: string;
    gitObjectType: string;
    commitId: string;
  }>;
  nextSkip?: number;
  nextTop?: number;
}

export interface PullRequestContext {
  source: "internal";
  pullRequest: PullRequestSummary & {
    codeReviewId: number;
    project: string;
    description: string;
    closedDate: string;
    workItemRefs: Array<{ id: string; url: string }>;
  };
  threads: PullRequestThreadSummary[];
  changes: PullRequestChangesSummary;
  builds: BuildSummary[];
}

export interface PullRequestInsightPreview {
  source: "llm" | "heuristic";
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals: {
    fileCount: number;
    threadCount: number;
    failedBuildCount: number;
    workItemCount: number;
    failedPolicyCount?: number;
    buildBlockers?: Array<{
      id: number;
      buildNumber: string;
      definitionName: string;
      status: string;
      result: string;
      url: string;
    }>;
    policyBlockers?: Array<{
      id: string;
      name: string;
      typeName: string;
      status: string;
      isBlocking: boolean;
    }>;
    activeThreads?: Array<{
      id: number;
      status: string | number;
      author: string;
      firstComment: string;
    }>;
    linkedWorkItems?: Array<{
      id: number;
      type: string;
      title: string;
      state: string;
      url: string;
    }>;
  };
  tokensIn: number;
  tokensOut: number;
}

export interface PrInsightArtifactRecord {
  id: string;
  profileId: string;
  repository: string;
  pullRequestId: number;
  title: string;
  kind: "insight_preview" | "review_run";
  at: string;
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  decisionQueue?: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel?: "low" | "medium" | "high";
  contextConfidence?: "high" | "medium" | "low" | "";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals?: PullRequestInsightPreview["signals"];
  iterationId?: number;
  sourceCommit?: string;
  findingCount?: number;
  discardedFindingCount?: number;
  tokensIn: number;
  tokensOut: number;
}

export interface PrInsightArtifactHistoryMeta {
  artifactId: string;
  index: number;
  total: number;
  latest: boolean;
}

export type { ReviewHistoryRecord } from "./reviewHistoryLocal.js";
export { REVIEW_HISTORY_LS_KEY } from "./reviewHistoryLocal.js";

export interface ReviewQueueItem {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  decisionReasonCodes: string[];
  contextConfidence: "high" | "medium" | "low" | "";
  autoApprovedAt: string;
  autoApprovalActor: string;
  discardedFindingCount: number;
  hunkCoverageFiles: number;
  wholeFileFallbackFiles: number;
  changedHunkLines: number;
  manualDisposition: "" | "acknowledged" | "marked_safe" | "marked_blocked" | "changes_requested";
  manualDispositionAt: string;
  manualDispositionActor: string;
  manualDispositionNote: string;
  manualDispositionEvents: ReviewDispositionEvent[];
  manualDispositionWriteBackAttempted: boolean;
  manualDispositionWriteBackOk: boolean;
  manualDispositionWriteBackError: string;
  manualDispositionWriteBackAt: string;
  manualDispositionWriteBackThreadId: string;
  manualDispositionWriteBackUrl: string;
  manualDispositionWriteBackEvents: ReviewWriteBackEvent[];
}

export interface ReviewDispositionEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  actor: string;
  note: string;
}

export interface ReviewWriteBackEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  ok: boolean;
  actor: string;
  note: string;
  error: string;
  threadId: string;
  url: string;
}

export async function listProfiles(): Promise<WorkspaceProfile[]> {
  const r = await fetch(`${RUNTIME_URL}/profiles`);
  if (!r.ok) throw new Error(`/profiles HTTP ${r.status}`);
  return (await r.json()) as WorkspaceProfile[];
}

export async function getProfile(id: string): Promise<WorkspaceProfile> {
  const r = await fetch(`${RUNTIME_URL}/profiles/${id}`);
  if (!r.ok) throw new Error(`/profiles/${id} HTTP ${r.status}`);
  return (await r.json()) as WorkspaceProfile;
}

export async function createProfile(data: WorkspaceProfileInput): Promise<WorkspaceProfile> {
  const r = await fetch(`${RUNTIME_URL}/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`createProfile HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as WorkspaceProfile;
}

export async function updateProfile(id: string, data: Partial<WorkspaceProfileInput>): Promise<WorkspaceProfile> {
  const r = await fetch(`${RUNTIME_URL}/profiles/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`updateProfile HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as WorkspaceProfile;
}

export async function deleteProfile(id: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/profiles/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteProfile HTTP ${r.status}`);
}

export async function discoverAdoProjectLinkOptions(
  kind: AdoDiscoveryKind,
  profile: Partial<WorkspaceProfileInput>,
): Promise<AdoDiscoveryResult> {
  const r = await fetch(`${RUNTIME_URL}/profiles/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, profile }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(messageFromErrorBody(`discover ${kind} HTTP ${r.status}`, text));
  }
  return (await r.json()) as AdoDiscoveryResult;
}

export async function checkAdoProjectLinkTools(
  profile: Partial<WorkspaceProfileInput>,
): Promise<AdoMcpCheckResult> {
  const r = await fetch(`${RUNTIME_URL}/profiles/check-ado-tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!r.ok) {
    const text = await r.text();
    try {
      const diagnostic = JSON.parse(text) as Partial<AdoMcpCheckResult> & { error?: string };
      if (diagnostic.authStatus || diagnostic.authMessage) {
        return {
          ok: false,
          source: diagnostic.source ?? "internal",
          authMode: diagnostic.authMode,
          authStatus: diagnostic.authStatus,
          authMessage: diagnostic.authMessage ?? diagnostic.error ?? `check ADO tools HTTP ${r.status}`,
          retryable: diagnostic.retryable,
          toolCount: diagnostic.toolCount ?? 0,
          tools: diagnostic.tools ?? [],
          projectCount: diagnostic.projectCount,
        };
      }
    } catch {
      /* throw below */
    }
    throw new Error(`check ADO tools HTTP ${r.status}: ${text}`);
  }
  return (await r.json()) as AdoMcpCheckResult;
}

export async function fetchProfilePullRequests(
  profileId: string,
  status = "active",
): Promise<PullRequestSummary[]> {
  const profile = readProfileData(profileId);
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pull-requests?status=${encodeURIComponent(status)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(profile ? { profile } : {}),
    }),
  });
  if (!r.ok) throw new Error(`/profiles/${profileId}/pull-requests HTTP ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as { pullRequests: PullRequestSummary[] };
  return body.pullRequests;
}

export async function fetchProfilePullRequestContext(
  profileId: string,
  pullRequestId: number,
): Promise<PullRequestContext> {
  const profile = readProfileData(profileId);
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pull-requests/${pullRequestId}/context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(profile ? { profile } : {}),
    }),
  });
  if (!r.ok) {
    const fallback = `/profiles/${profileId}/pull-requests/${pullRequestId}/context HTTP ${r.status}`;
    throw new Error(messageFromErrorBody(fallback, await r.text()));
  }
  return (await r.json()) as PullRequestContext;
}

export async function fetchProfilePullRequestInsightPreview(
  profileId: string,
  pullRequestId: number,
): Promise<PullRequestInsightPreview> {
  const profile = readProfileData(profileId);
  const llmConfig = readLlmConfig();
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pull-requests/${pullRequestId}/insight-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(llmConfig ? { llmConfig } : {}),
      ...(profile ? { profile } : {}),
    }),
  });
  if (!r.ok) {
    const fallback = `/profiles/${profileId}/pull-requests/${pullRequestId}/insight-preview HTTP ${r.status}`;
    throw new Error(messageFromErrorBody(fallback, await r.text()));
  }
  return (await r.json()) as PullRequestInsightPreview;
}

export async function fetchProfilePrInsightArtifacts(
  profileId: string,
  pullRequestId?: number,
): Promise<PrInsightArtifactRecord[]> {
  return (await fetchProfilePrInsightArtifactsWithHistory(profileId, pullRequestId)).items;
}

export async function fetchProfilePrInsightArtifactsWithHistory(
  profileId: string,
  pullRequestId?: number,
): Promise<{ items: PrInsightArtifactRecord[]; history: PrInsightArtifactHistoryMeta[] }> {
  const suffix = pullRequestId === undefined ? "" : `?pullRequestId=${encodeURIComponent(String(pullRequestId))}`;
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pr-insights${suffix}`);
  if (!r.ok) throw new Error(`/profiles/${profileId}/pr-insights HTTP ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as {
    items?: PrInsightArtifactRecord[];
    history?: PrInsightArtifactHistoryMeta[];
  };
  return {
    items: body.items ?? [],
    history: body.history ?? [],
  };
}

export async function fetchProfilePrInsightArtifactById(
  profileId: string,
  artifactId: string,
): Promise<PrInsightArtifactRecord> {
  const suffix = `?artifactId=${encodeURIComponent(artifactId)}`;
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pr-insights/artifact${suffix}`);
  if (!r.ok) throw new Error(`/profiles/${profileId}/pr-insights/artifact HTTP ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as { record?: PrInsightArtifactRecord };
  if (!body.record) throw new Error("PR insight artifact lookup response did not include a record");
  return body.record;
}

export async function saveProfilePrInsightArtifact(
  profileId: string,
  artifact: Omit<PrInsightArtifactRecord, "id" | "profileId"> & {
    id?: string;
    profileId?: string;
  },
): Promise<PrInsightArtifactRecord> {
  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/pr-insights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(artifact),
  });
  if (!r.ok) throw new Error(`/profiles/${profileId}/pr-insights HTTP ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as { record?: PrInsightArtifactRecord };
  if (!body.record) throw new Error("PR insight artifact response did not include a record");
  return body.record;
}

export async function fetchProfileReviewQueue(profileId: string): Promise<{
  configured: boolean;
  items: ReviewQueueItem[];
  storage?: "azure" | "local" | "browser";
}> {
  const profile = readProfileData(profileId);
  const repoName = typeof profile?.["adoRepoName"] === "string" ? profile["adoRepoName"] : "";

  try {
    const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-queue`);
    if (!r.ok) throw new Error(`/profiles/${profileId}/review-queue HTTP ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as {
      configured: boolean;
      items: ReviewQueueItem[];
      storage?: "azure" | "local";
    };

    if (body.configured) {
      return { configured: true, items: body.items, storage: body.storage ?? "azure" };
    }

    if (body.items.length > 0) syncReviewHistoryLocal(body.items);
    const browserItems = listReviewHistoryLocal(repoName);
    return {
      configured: false,
      items: mergeReviewQueueItems(body.items, browserItems),
      storage: body.items.length > 0 ? "local" : browserItems.length > 0 ? "browser" : "local",
    };
  } catch {
    return {
      configured: false,
      items: listReviewHistoryLocal(repoName),
      storage: "browser",
    };
  }
}

export async function recordProfileReviewHistory(
  profileId: string,
  record: Omit<ReviewHistoryRecord, "repository"> & {
    repository?: string;
  },
): Promise<void> {
  const profile = readProfileData(profileId);
  const repository =
    record.repository ??
    (typeof profile?.["adoRepoName"] === "string" ? profile["adoRepoName"] : "");
  if (!repository.trim()) throw new Error("profile has no adoRepoName");

  const full = { ...record, repository: repository.trim() };
  upsertReviewHistoryLocal(full);

  try {
    const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pullRequestId: full.pullRequestId,
        lastIterationId: full.lastIterationId,
        findingCount: full.findingCount,
        lastRunAt: full.lastRunAt,
        sourceCommit: full.sourceCommit,
        decisionQueue: full.decisionQueue,
        decisionRiskLevel: full.decisionRiskLevel,
        decisionReason: full.decisionReason,
        decisionReasonCodes: full.decisionReasonCodes,
        contextConfidence: full.contextConfidence,
        autoApprovedAt: full.autoApprovedAt,
        autoApprovalActor: full.autoApprovalActor,
        discardedFindingCount: full.discardedFindingCount,
        hunkCoverageFiles: full.hunkCoverageFiles,
        wholeFileFallbackFiles: full.wholeFileFallbackFiles,
        changedHunkLines: full.changedHunkLines,
        manualDisposition: full.manualDisposition,
        manualDispositionAt: full.manualDispositionAt,
        manualDispositionActor: full.manualDispositionActor,
        manualDispositionNote: full.manualDispositionNote,
        manualDispositionEvents: full.manualDispositionEvents,
        manualDispositionWriteBackAttempted: full.manualDispositionWriteBackAttempted,
        manualDispositionWriteBackOk: full.manualDispositionWriteBackOk,
        manualDispositionWriteBackError: full.manualDispositionWriteBackError,
        manualDispositionWriteBackAt: full.manualDispositionWriteBackAt,
        manualDispositionWriteBackThreadId: full.manualDispositionWriteBackThreadId,
        manualDispositionWriteBackUrl: full.manualDispositionWriteBackUrl,
        manualDispositionWriteBackEvents: full.manualDispositionWriteBackEvents,
      }),
    });
    if (!r.ok && r.status !== 400) {
      throw new Error(`/profiles/${profileId}/review-history HTTP ${r.status}: ${await r.text()}`);
    }
  } catch {
    // Daemon unreachable — browser copy is enough for this session.
  }
}

export async function recordProfileReviewDisposition(
  profileId: string,
  record: Omit<ReviewHistoryRecord, "repository"> & {
    repository?: string;
  },
  options: { writeBackToAdo?: boolean } = {},
): Promise<ReviewQueueItem | null> {
  const profile = readProfileData(profileId);
  const repository =
    record.repository ??
    (typeof profile?.["adoRepoName"] === "string" ? profile["adoRepoName"] : "");
  if (!repository.trim()) throw new Error("profile has no adoRepoName");

  const full = { ...record, repository: repository.trim() };
  upsertReviewHistoryLocal(full);

  try {
    const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pullRequestId: full.pullRequestId,
        lastIterationId: full.lastIterationId,
        findingCount: full.findingCount,
        lastRunAt: full.lastRunAt,
        sourceCommit: full.sourceCommit,
        decisionQueue: full.decisionQueue,
        decisionRiskLevel: full.decisionRiskLevel,
        decisionReason: full.decisionReason,
        decisionReasonCodes: full.decisionReasonCodes,
        contextConfidence: full.contextConfidence,
        autoApprovedAt: full.autoApprovedAt,
        autoApprovalActor: full.autoApprovalActor,
        discardedFindingCount: full.discardedFindingCount,
        hunkCoverageFiles: full.hunkCoverageFiles,
        wholeFileFallbackFiles: full.wholeFileFallbackFiles,
        changedHunkLines: full.changedHunkLines,
        manualDisposition: full.manualDisposition,
        manualDispositionAt: full.manualDispositionAt,
        manualDispositionActor: full.manualDispositionActor,
        manualDispositionNote: full.manualDispositionNote,
        manualDispositionEvents: full.manualDispositionEvents,
        manualDispositionWriteBackAttempted: full.manualDispositionWriteBackAttempted,
        manualDispositionWriteBackOk: full.manualDispositionWriteBackOk,
        manualDispositionWriteBackError: full.manualDispositionWriteBackError,
        manualDispositionWriteBackAt: full.manualDispositionWriteBackAt,
        manualDispositionWriteBackThreadId: full.manualDispositionWriteBackThreadId,
        manualDispositionWriteBackUrl: full.manualDispositionWriteBackUrl,
        manualDispositionWriteBackEvents: full.manualDispositionWriteBackEvents,
        writeBackToAdo: options.writeBackToAdo ?? true,
      }),
    });
    if (!r.ok && r.status !== 400) {
      throw new Error(`/profiles/${profileId}/review-disposition HTTP ${r.status}: ${await r.text()}`);
    }
    if (r.ok) {
      const body = (await r.json()) as { record?: ReviewQueueItem };
      if (body.record) {
        upsertReviewHistoryLocal(body.record);
        return body.record;
      }
    }
  } catch {
    // Daemon unreachable - browser copy is enough for this session.
  }
  return null;
}

export async function fetchProfileReviewOperations(profileId: string): Promise<ReviewOperationEvent[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-operations`);
    if (!r.ok) throw new Error(`/profiles/${profileId}/review-operations HTTP ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as { items?: ReviewOperationEvent[] };
    return body.items ?? [];
  } catch {
    return listReviewOperations();
  }
}

export async function recordProfileReviewOperation(
  profileId: string,
  event: Omit<ReviewOperationEvent, "id" | "at" | "actor"> & {
    at?: string;
    actor?: string;
  },
): Promise<ReviewOperationEvent> {
  const local = appendReviewOperation(event);
  try {
    const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: local.kind,
        at: local.at,
        pullRequestId: local.pullRequestId,
        actor: local.actor,
        label: local.label,
        ok: local.ok,
        details: local.details,
      }),
    });
    if (!r.ok) return local;
    const body = (await r.json()) as { record?: ReviewOperationEvent };
    return body.record ?? local;
  } catch {
    return local;
  }
}

// ─── Azure Auth ───────────────────────────────────────────────────────────────

export interface AuthUser {
  authenticated: boolean;
  oid?: string;
  homeAccountId?: string;
  tenantId?: string;
  username?: string;
  upn?: string;
  name?: string;
  avatarDataUrl?: string;
  fromCache?: boolean;
  message?: string;
  azureAuthConfig?: {
    tenantId?: string;
    clientId?: string;
    usesDefaultTenant: boolean;
    usesDefaultClient: boolean;
    azureDevOpsScopes: string[];
  };
}

export interface AuthCachedAccount {
  homeAccountId: string;
  localAccountId?: string;
  tenantId?: string;
  username?: string;
  name?: string;
  avatarDataUrl?: string;
}

/** Instant cached user — no Azure round-trip, safe to call on every render cycle. */
export async function fetchAuthStatus(): Promise<AuthUser> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/status`);
    if (!r.ok) return { authenticated: false };
    return (await r.json()) as AuthUser;
  } catch {
    return { authenticated: false };
  }
}

/** Live user identity — verifies the credential is still valid and persists result. */
export async function fetchAuthMe(): Promise<AuthUser> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/me`);
    if (!r.ok) return { authenticated: false };
    return (await r.json()) as AuthUser;
  } catch {
    return { authenticated: false };
  }
}

export async function fetchAuthAccounts(): Promise<AuthCachedAccount[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}/auth/accounts`);
    if (!r.ok) return [];
    const data = await r.json() as { accounts?: AuthCachedAccount[] };
    return data.accounts ?? [];
  } catch {
    return [];
  }
}

export type AuthLoginEvent =
  | { type: "status"; message: string }
  | { type: "browser"; browser: AuthBrowserChoice; message: string }
  | { type: "output"; line: string }
  | { type: "done"; authenticated: boolean; oid?: string; upn?: string; name?: string; avatarDataUrl?: string }
  | { type: "error"; message: string };

export type AuthBrowserChoice = "default" | "edge" | "chrome";

/**
 * Stream Microsoft browser login via the daemon.
 * Returns a cancel function. Calls `onEvent` for each SSE event.
 */
export function authLoginStream(
  browser: AuthBrowserChoice,
  onEvent: (e: AuthLoginEvent) => void,
  opts: { loginHint?: string; accountHomeId?: string } = {},
): () => void {
  const controller = new AbortController();

  fetch(`${RUNTIME_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ browser, loginHint: opts.loginHint, accountHomeId: opts.accountHomeId }),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok || !r.body) { onEvent({ type: "error", message: `HTTP ${r.status}` }); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let currentEvent = "output";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); }
          else if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as Record<string, unknown>;
              onEvent({ type: currentEvent, ...d } as AuthLoginEvent);
            } catch { /* ignore */ }
          }
        }
      }
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });

  return () => controller.abort();
}

export async function enableAzureDevOpsOAuth(
  browser: AuthBrowserChoice = "default",
  opts: { loginHint?: string; accountHomeId?: string } = {},
): Promise<{ ok: boolean; authMode: "oauth"; tokenAvailable: boolean; message: string; user?: AuthUser }> {
  const r = await fetch(`${RUNTIME_URL}/auth/azure-devops/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ browser, loginHint: opts.loginHint, accountHomeId: opts.accountHomeId }),
  });
  const body = await r.json().catch(() => ({})) as {
    ok?: boolean;
    authMode?: "oauth";
    tokenAvailable?: boolean;
    message?: string;
    authMessage?: string;
    user?: AuthUser;
  };
  if (!r.ok || !body.ok) throw new Error(body.authMessage ?? body.message ?? `ADO OAuth HTTP ${r.status}`);
  return {
    ok: true,
    authMode: "oauth",
    tokenAvailable: Boolean(body.tokenAvailable),
    message: body.message ?? "Azure DevOps OAuth is enabled.",
    user: body.user,
  };
}

/** Sign out — clears the daemon's local app identity cache. */
export async function authLogout(): Promise<void> {
  await fetch(`${RUNTIME_URL}/auth/logout`, { method: "POST" });
}

export interface ReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warning" | "blocking";
  category: "bug" | "missing-test" | "security" | "style" | "design";
  message: string;
}

export interface ReviewDiscardedFinding extends ReviewFinding {
  reason: "unknown_file" | "invalid_line" | "outside_changed_hunk" | "empty_message" | "duplicate";
}

export interface ReviewRunResult {
  ok: boolean;
  pullRequestId: number;
  repository: string;
  iterationId: number;
  sourceCommit?: string;
  findingCount: number;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  decisionReasonCodes?: string[];
  contextConfidence?: "high" | "medium" | "low";
  readiness?: "ready" | "needs_attention" | "blocked";
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  lastRunAt: string;
  autoApprovalActor: string;
  tokensIn: number;
  tokensOut: number;
  summary: string;
  metadata?: {
    estimatedEffort: 1 | 2 | 3 | 4 | 5;
    testsRequired: boolean;
    securityConcern: boolean;
    canBeSplit: boolean;
    keyIssues: string[];
  };
  compression?: {
    compressed: boolean;
    includedFiles: string[];
    omittedFiles: string[];
  };
  coverage?: {
    totalFiles: number;
    filesWithHunks: number;
    wholeFileOnlyFiles: number;
    hunkCount: number;
    changedHunkLines: number;
  };
  findings?: ReviewFinding[];
  discardedFindings?: ReviewDiscardedFinding[];
}

/**
 * POST /profiles/:id/review-run
 * Invokes the Review Agent immediately on the given PR.
 * The daemon uses ADO OAuth first, then optional profile PAT fallback, plus the
 * daemon's LLM config to build context, run the planner, decide the queue lane,
 * and persist the result.
 * Returns the decision so the frontend can update the history record in-place.
 */
export async function runProfileReviewRun(
  profileId: string,
  pullRequestId: number,
  targetBranch: string,
): Promise<ReviewRunResult> {
  const profile = readProfileData(profileId);
  const llmConfig = readLlmConfig();

  const r = await fetch(`${RUNTIME_URL}/profiles/${profileId}/review-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pullRequestId,
      targetBranch,
      ...(llmConfig ? { llmConfig } : {}),
      ...(profile ? { profile } : {}),
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(messageFromErrorBody(`review-run HTTP ${r.status}`, body));
  }

  return (await r.json()) as ReviewRunResult;
}

/** Migrate local profiles → Azure Table Storage. Returns counts. */
export async function migrateProfilesToCloud(): Promise<{ migrated: number; skipped: number; total: number }> {
  const r = await fetch(`${RUNTIME_URL}/profiles/migrate`, { method: "POST" });
  if (!r.ok) {
    const body = await r.json() as { message?: string };
    throw new Error(body.message ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<{ migrated: number; skipped: number; total: number }>;
}

/**
 * Returns true when the error from a daemon call indicates an expired Azure credential.
 * Used to show a "Sign in again" banner rather than a generic error.
 */
export function isAzureAuthError(err: unknown): boolean {
  if (err instanceof Response) return err.status === 401;
  if (err instanceof Error) return /azure_auth_required|credential|401|403/i.test(err.message);
  return false;
}

// ─── Daemon configuration ─────────────────────────────────────────────────────

export interface DaemonConfigPayload {
  llmProvider?: "azure" | "openai";
  azureEndpoint?: string;
  azureApiKey?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  // Azure cloud persistence
  azureStorageAccount?: string;
  azureKeyVaultUrl?: string;
  azureCosmosEndpoint?: string;
  azureTenantId?: string;
  azureClientId?: string;
  reviewAutoApproveEnabled?: boolean;
  reviewStaleAgeHours?: number;
}

export interface DaemonConfig {
  llmProvider: string;
  azureDeployment: string;
  azureApiVersion: string;
  azureEndpoint: string;
  openaiModel: string;
  aoaiKeyInVault: boolean;
  azureStorageAccount: string;
  azureKeyVaultUrl: string;
  azureCosmosEndpoint: string;
  azureTenantId: string;
  azureClientId: string;
  azureAuthUsesDefaultTenant: boolean;
  azureAuthUsesDefaultClient: boolean;
  reviewAutoApproveEnabled: boolean;
  reviewStaleAgeHours: number;
}

export interface AzureDevOpsRemoteSuggestion {
  remoteName: string;
  remoteUrl: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
}

/** List git branches for a repo path by asking the daemon (which uses shell:true to find git). */
export async function fetchGitBranchesFromDaemon(repoPath: string): Promise<string[]> {
  try {
    const r = await fetch(`${RUNTIME_URL}/git/branches?repoPath=${encodeURIComponent(repoPath)}`);
    if (!r.ok) return [];
    const data = await r.json() as { branches: string[] };
    return data.branches ?? [];
  } catch {
    return [];
  }
}

/** Infer Azure DevOps Project Link fields from the local repository's git remotes. */
export async function fetchAzureDevOpsRemoteSuggestionFromDaemon(repoPath: string): Promise<AzureDevOpsRemoteSuggestion | null> {
  try {
    const r = await fetch(`${RUNTIME_URL}/git/azure-devops-remote?repoPath=${encodeURIComponent(repoPath)}`);
    if (!r.ok) return null;
    const data = await r.json() as { suggestion: AzureDevOpsRemoteSuggestion | null };
    return data.suggestion ?? null;
  } catch {
    return null;
  }
}

/** Read the daemon's current non-secret configuration for pre-filling the Settings UI. */
export async function fetchDaemonConfig(): Promise<DaemonConfig | null> {
  try {
    const r = await fetch(`${RUNTIME_URL}/daemon/config`);
    if (!r.ok) return null;
    return (await r.json()) as DaemonConfig;
  } catch {
    return null;
  }
}

/**
 * Persist LLM credentials to ~/.cicd-agent/.env on the daemon host and
 * hot-reload them so they take effect immediately without a daemon restart.
 */
export async function configureDaemon(
  cfg: DaemonConfigPayload,
): Promise<{ ok: boolean; llmConfigured: boolean; cloudProfileStore?: boolean; cloudSecrets?: boolean; cloudSessions?: boolean }> {
  const r = await fetch(`${RUNTIME_URL}/daemon/configure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`/daemon/configure HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as { ok: boolean; llmConfigured: boolean; cloudProfileStore?: boolean; cloudSecrets?: boolean; cloudSessions?: boolean };
}
