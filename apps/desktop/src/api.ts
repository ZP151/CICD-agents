const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL ?? "http://127.0.0.1:8787";

export async function fetchHealth(): Promise<{ ok: boolean; uptimeSec?: number; llmConfigured?: boolean }> {
  const r = await fetch(`${RUNTIME_URL}/healthz`);
  if (!r.ok) throw new Error(`/healthz HTTP ${r.status}`);
  return r.json();
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

/**
 * POST /chat — streams a conversational turn via SSE.
 * Returns the sessionId (from the first "session" event) and a cancel function.
 */
export function chatStream(
  message: string,
  repoPath: string,
  sessionId: string | null,
  onEvent: (payload: ChatEventPayload) => void,
): { cancel: () => void } {
  const controller = new AbortController();

  const body: Record<string, unknown> = { message, repoPath };
  if (sessionId) body["sessionId"] = sessionId;

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
