import { readLlmConfig, readProjectLinkData, type ConversationModelChoice } from "./localSettings.js";
import { RUNTIME_URL, explainRuntimeError, messageFromErrorBody } from "./runtime.js";
import { readSseJsonStream } from "./sse.js";
import type {
  ChatCheckpointActivity,
  ChatCheckpointPreview,
  ChatCheckpointRollbackPlan,
  ChatEventPayload,
  ChatEventType,
  ChatHistoryEntry,
  ChatIndexRefreshResult,
  ChatIndexStatus,
  ChatMessageEntry,
  ChatUiChunk,
  ChatWorkflowAction,
  ChatWorkflowActionInput,
  ChatWorkflowActionResult,
  ChatWorkflowState,
} from "./chatTypes.js";

/**
 * POST /chat — streams a conversational turn via SSE.
 * Returns a cancel function for aborting the in-flight request.
 */
export function chatStream(
  message: string,
  repoPath: string,
  sessionId: string | null,
  onEvent: (payload: ChatEventPayload) => void,
  projectLinkId?: string,
  conversationModelChoice: ConversationModelChoice = "built_in",
): { cancel: () => void } {
  const controller = new AbortController();

  const body: Record<string, unknown> = { message, repoPath };
  if (sessionId) body["sessionId"] = sessionId;
  if (projectLinkId) {
    body["projectLinkId"] = projectLinkId;
  }

  const llmConfig = readLlmConfig(conversationModelChoice);
  if (llmConfig) body["llmConfig"] = llmConfig;
  const projectLink = readProjectLinkData(projectLinkId);
  if (projectLink) body["projectLink"] = projectLink;

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
      await readChatEventStream(r, onEvent);
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return { cancel: () => controller.abort() };
}

/** Dispatch a structured confirm-action and stream its continuation events. */
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
      await readChatEventStream(r, onEvent);
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return { cancel: () => controller.abort() };
}

export async function fetchChatIndexStatus(repoPath: string, projectLinkId?: string): Promise<ChatIndexStatus> {
  const r = await fetch(`${RUNTIME_URL}/chat/index-status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chatIndexBody(repoPath, projectLinkId)),
  });
  if (!r.ok) throw new Error(`/chat/index-status HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatIndexStatus;
}

export async function refreshChatIndexStatus(repoPath: string, projectLinkId?: string): Promise<ChatIndexRefreshResult> {
  const r = await fetch(`${RUNTIME_URL}/chat/index-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chatIndexBody(repoPath, projectLinkId)),
  });
  if (!r.ok) throw new Error(`/chat/index-refresh HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatIndexRefreshResult;
}

export async function confirmPlan(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm`, { method: "POST" });
  if (!r.ok) throw new Error(`confirm failed: HTTP ${r.status}`);
}

export async function cancelPlan(sessionId: string): Promise<void> {
  await fetch(`${RUNTIME_URL}/chat/${sessionId}/cancel`, { method: "POST" });
}

export async function fetchChatHistory(): Promise<ChatHistoryEntry[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/history`);
  if (!r.ok) throw new Error(`/chat/history HTTP ${r.status}`);
  return (await r.json()) as ChatHistoryEntry[];
}

export async function updateChatSessionMetadata(
  sessionId: string,
  patch: { title?: string | null; pinned?: boolean },
): Promise<ChatHistoryEntry> {
  const r = await fetch(`${RUNTIME_URL}/chat/${encodeURIComponent(sessionId)}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`/chat/${sessionId}/metadata HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatHistoryEntry;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`/chat/${sessionId} HTTP ${r.status}: ${await r.text()}`);
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
  projectLinkId?: string | null,
  input?: ChatWorkflowActionInput,
): Promise<ChatWorkflowActionResult> {
  const projectLink = readProjectLinkData(projectLinkId ?? undefined);
  const projectLinkIdentity = projectLinkId
    ? { projectLinkId }
    : {};
  const r = await fetch(`${RUNTIME_URL}/chat/workflow-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      repoPath,
      ...projectLinkIdentity,
      ...(input ?? {}),
      ...(projectLink ? { projectLink } : {}),
    }),
  });
  if (!r.ok) throw new Error(`/chat/workflow-action HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ChatWorkflowActionResult;
}

function chatIndexBody(repoPath: string, projectLinkId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { repoPath };
  const llmConfig = readLlmConfig();
  if (llmConfig) body["llmConfig"] = llmConfig;
  const projectLink = readProjectLinkData(projectLinkId);
  if (projectLink) body["projectLink"] = projectLink;
  return body;
}

async function readChatEventStream(
  response: Response,
  onEvent: (payload: ChatEventPayload) => void,
): Promise<void> {
  await readSseJsonStream<ChatEventPayload & { result?: unknown; chunk?: ChatUiChunk }>(
    response,
    ({ event: currentEventType, data: parsed }) => {
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
    },
  );
}
