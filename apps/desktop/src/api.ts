const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL ?? "http://127.0.0.1:8787";

export interface HealthStatus {
  ok: boolean;
  uptimeSec?: number;
  llmConfigured?: boolean;
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
  steps: Array<{ seq: number; name: string; detail: string; status: string; createdAt: number }>;
  result: unknown;
  error: string;
  createdAt: number;
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
  | "thinking"
  | "tool_start"
  | "tool_end"
  | "confirm_required"
  | "executing"
  | "message"
  | "done"
  | "error"
  | "cancelled";

export interface ChatEventPayload {
  type: ChatEventType;
  // session
  sessionId?: string;
  // thinking
  delta?: string;
  // tool_start / tool_end
  name?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  toolResult?: unknown;  // structured tool output for renderers
  // confirm_required
  riskLevel?: string;
  plan?: string;
  // message / error
  text?: string;
  message?: string;
  // done
  result?: {
    response: string;
    riskLevel: string;
    actionsTaken: string[];
    suggestions: string[];
    pendingAction?: {
      tool: string;
      args: Record<string, unknown>;
      description: string;
      nextHint?: string;
    };
  };
}

export interface ChatHistoryEntry {
  sessionId: string;
  preview: string;
  createdAt: number;
}

export interface ChatMessageEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── localStorage config readers ─────────────────────────────────────────────
// Read at call time so any changes the user makes in Settings / Profiles are
// picked up immediately without a page reload.

function readLlmConfig(): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem("dev_agent_settings");
    if (!raw) return undefined;
    const s = JSON.parse(raw) as Record<string, unknown>;
    // Only include fields the daemon understands; omit empty strings.
    const config: Record<string, unknown> = {};
    if (s["llmProvider"]) config["llmProvider"] = s["llmProvider"];
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
): { cancel: () => void } {
  const controller = new AbortController();

  const body: Record<string, unknown> = { message, repoPath };
  if (sessionId) body["sessionId"] = sessionId;
  if (profileId) body["profileId"] = profileId;

  // Attach LLM config and full profile data so the daemon uses the user's
  // UI-configured settings rather than requiring a .env file.
  const llmConfig = readLlmConfig();
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
        onEvent({ type: "error", message: `HTTP ${r.status}` });
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
              const parsed = JSON.parse(raw) as ChatEventPayload & { result?: unknown };
              // For tool_end, the backend sends { type, name, ok, summary, result }
              // Map `result` → `toolResult` to avoid collision with the done `result`
              const toolResult = currentEventType === "tool_end" ? parsed.result : undefined;
              const doneResult = currentEventType === "done"
                ? (parsed.result as ChatEventPayload["result"])
                : undefined;
              onEvent({
                ...parsed,
                type: (currentEventType as ChatEventType) || parsed.type,
                toolResult,
                result: doneResult,
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
        onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });

  return { cancel: () => controller.abort() };
}

export async function confirmPlan(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm`, { method: "POST" });
  if (!r.ok) throw new Error(`confirm failed: HTTP ${r.status}`);
}

/** Dispatch a structured confirm-action (bypasses chat input — directly executes pendingAction). */
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
        onEvent({ type: "error", message: `HTTP ${r.status}` });
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
              const parsed = JSON.parse(raw) as ChatEventPayload & { result?: unknown };
              const toolResult = currentEventType === "tool_end" ? parsed.result : undefined;
              const doneResult = currentEventType === "done"
                ? (parsed.result as ChatEventPayload["result"])
                : undefined;
              onEvent({
                ...parsed,
                type: (currentEventType as ChatEventType) || parsed.type,
                toolResult,
                result: doneResult,
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
        onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
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

export async function fetchChatMessages(sessionId: string): Promise<ChatMessageEntry[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/messages`);
  if (!r.ok) throw new Error(`/chat/messages HTTP ${r.status}`);
  return (await r.json()) as ChatMessageEntry[];
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
  templateProfile: string;
  buildCommand: string;
  testCommand: string;
}

export type WorkspaceProfileInput = Omit<WorkspaceProfile, "id" | "createdAt" | "updatedAt">;

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

// ─── Azure Auth ───────────────────────────────────────────────────────────────

export interface AuthUser {
  authenticated: boolean;
  oid?: string;
  upn?: string;
  name?: string;
  fromCache?: boolean;
  message?: string;
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

export type AuthLoginEvent =
  | { type: "status"; message: string }
  | { type: "output"; line: string }
  | { type: "done"; authenticated: boolean; oid?: string; upn?: string; name?: string }
  | { type: "error"; message: string };

/**
 * Stream `az login` via the daemon.
 * Returns a cancel function. Calls `onEvent` for each SSE event.
 */
export function authLoginStream(onEvent: (e: AuthLoginEvent) => void): () => void {
  const controller = new AbortController();

  fetch(`${RUNTIME_URL}/auth/login`, {
    method: "POST",
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

/** Sign out — calls az logout on the daemon host and clears the cache. */
export async function authLogout(): Promise<void> {
  await fetch(`${RUNTIME_URL}/auth/logout`, { method: "POST" });
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
