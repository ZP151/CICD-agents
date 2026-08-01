import { readLlmConfig, readProjectLinkData, type ConversationModelChoice } from "./localSettings.js";
import {
  RUNTIME_URL,
  explainRuntimeError,
  messageFromErrorBody,
  messageFromErrorResponse,
} from "./runtime.js";
import { readSseJsonStream } from "./sse.js";
import type { ProjectLink } from "./projectLinkTypes.js";
import type {
  ChatCheckpointActivity,
  ChatCheckpointPreview,
  ChatCheckpointRollbackPlan,
  ChatEventPayload,
  ChatEventType,
  ChatHistoryEntry,
  ChatIndexRefreshResult,
  ChatMessageEntry,
  ChatSessionMessages,
  ChatUiChunk,
  ChatWorkflowAction,
  ChatWorkflowActionInput,
  ChatWorkflowActionResult,
  ChatWorkflowState,
} from "./chatTypes.js";

export interface ChatImageAttachmentPayload {
  name: string;
  mimeType: string;
  dataUrl: string;
}

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
  imageAttachments: ChatImageAttachmentPayload[] = [],
  projectLinkData?: ProjectLink | null,
): { cancel: () => void } {
  const controller = new AbortController();
  let cancelled = false;

  const body: Record<string, unknown> = { message, repoPath };
  if (sessionId) body["sessionId"] = sessionId;
  if (projectLinkId) {
    body["projectLinkId"] = projectLinkId;
  }

  const llmConfig = readLlmConfig(conversationModelChoice);
  if (llmConfig) body["llmConfig"] = llmConfig;
  const projectLink = projectLinkData ?? readProjectLinkData(projectLinkId);
  if (projectLink) body["projectLink"] = projectLink;
  if (imageAttachments.length > 0) body["imageAttachments"] = imageAttachments;

  fetch(`${RUNTIME_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (cancelled) return;
      if (!r.ok || !r.body) {
        const bodyText = await r.text().catch(() => "");
        onEvent({ type: "error", message: messageFromErrorBody(`HTTP ${r.status}`, bodyText) });
        return;
      }
      await readChatEventStream(r, onEvent);
    })
    .catch((err: unknown) => {
      if (!cancelled && (err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

/** Dispatch a structured confirm-action and stream its continuation events. */
export function confirmAction(
  sessionId: string,
  onEvent: (payload: ChatEventPayload) => void,
  continuation?: { turnId: string; startedAt: number; lastSequence?: number },
): { cancel: () => void } {
  const controller = new AbortController();
  let cancelled = false;

  fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(continuation ?? {}),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (cancelled) return;
      if (!r.ok || !r.body) {
        const bodyText = await r.text().catch(() => "");
        onEvent({ type: "error", message: messageFromErrorBody(`HTTP ${r.status}`, bodyText) });
        return;
      }
      await readChatEventStream(r, onEvent);
    })
    .catch((err: unknown) => {
      if (!cancelled && (err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

/** Decline a structured action while keeping its original Turn alive. */
export function declineAction(
  sessionId: string,
  onEvent: (payload: ChatEventPayload) => void,
  continuation: { turnId: string; startedAt: number; lastSequence?: number },
): { cancel: () => void } {
  const controller = new AbortController();
  let cancelled = false;

  fetch(`${RUNTIME_URL}/chat/${sessionId}/decline-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(continuation),
    signal: controller.signal,
  })
    .then(async (r) => {
      if (cancelled) return;
      if (!r.ok || !r.body) {
        const bodyText = await r.text().catch(() => "");
        onEvent({ type: "error", message: messageFromErrorBody(`HTTP ${r.status}`, bodyText) });
        return;
      }
      await readChatEventStream(r, onEvent);
    })
    .catch((err: unknown) => {
      if (!cancelled && (err as { name?: string }).name !== "AbortError") {
        onEvent({ type: "error", message: explainRuntimeError(err instanceof Error ? err.message : String(err)) });
      }
    });

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

export async function refreshChatIndexStatus(repoPath: string, projectLinkId?: string): Promise<ChatIndexRefreshResult> {
  const r = await fetch(`${RUNTIME_URL}/chat/index-refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(chatIndexBody(repoPath, projectLinkId)),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Chat index refresh HTTP ${r.status}`, r));
  return (await r.json()) as ChatIndexRefreshResult;
}

export async function confirmPlan(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/confirm`, { method: "POST" });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Confirm action HTTP ${r.status}`, r));
}

export async function cancelPlan(sessionId: string): Promise<void> {
  await fetch(`${RUNTIME_URL}/chat/${sessionId}/cancel`, { method: "POST" });
}

export async function fetchChatHistory(): Promise<ChatHistoryEntry[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/history`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Chat history HTTP ${r.status}`, r));
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
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Update chat metadata HTTP ${r.status}`, r));
  return (await r.json()) as ChatHistoryEntry;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/chat/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delete chat HTTP ${r.status}`, r));
}

export async function fetchChatCheckpointActivity(): Promise<ChatCheckpointActivity[]> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Checkpoints HTTP ${r.status}`, r));
  return chatCheckpointActivityFromResponse(await r.json());
}

export function chatCheckpointActivityFromResponse(value: unknown): ChatCheckpointActivity[] {
  if (Array.isArray(value)) return value as ChatCheckpointActivity[];
  if (
    value &&
    typeof value === "object" &&
    "items" in value &&
    Array.isArray((value as { items?: unknown }).items)
  ) {
    return (value as { items: ChatCheckpointActivity[] }).items;
  }
  throw new Error(
    "Git checkpoints could not be loaded because the desktop daemon returned an unexpected response.",
  );
}

export async function fetchChatCheckpointPreview(
  checkpointId: string,
  maxDiffChars = 12000,
): Promise<ChatCheckpointPreview> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints/${encodeURIComponent(checkpointId)}/preview?maxDiffChars=${maxDiffChars}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Checkpoint preview HTTP ${r.status}`, r));
  return (await r.json()) as ChatCheckpointPreview;
}

export async function fetchChatCheckpointRollbackPlan(
  checkpointId: string,
): Promise<ChatCheckpointRollbackPlan> {
  const r = await fetch(`${RUNTIME_URL}/chat/checkpoints/${encodeURIComponent(checkpointId)}/rollback-plan`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Checkpoint rollback plan HTTP ${r.status}`, r));
  return (await r.json()) as ChatCheckpointRollbackPlan;
}

export async function fetchChatMessages(sessionId: string): Promise<ChatSessionMessages> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/messages`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Chat messages HTTP ${r.status}`, r));
  const payload = await r.json() as ChatMessageEntry[] | ChatSessionMessages;
  // Desktop releases before Transcript persistence returned an array. Keep
  // that payload readable during a rolling sidecar upgrade.
  return Array.isArray(payload) ? { bubbles: payload } : payload;
}

export async function fetchChatState(sessionId: string): Promise<{ workflowState?: ChatWorkflowState }> {
  const r = await fetch(`${RUNTIME_URL}/chat/${sessionId}/state`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Chat state HTTP ${r.status}`, r));
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
  const actionInput = compactWorkflowActionInput(input);
  const r = await fetch(`${RUNTIME_URL}/chat/workflow-action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      repoPath,
      ...projectLinkIdentity,
      ...actionInput,
      ...(projectLink ? { projectLink } : {}),
    }),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Workflow action HTTP ${r.status}`, r));
  return (await r.json()) as ChatWorkflowActionResult;
}

function compactWorkflowActionInput(input?: ChatWorkflowActionInput): Record<string, unknown> {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined),
  );
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
      const doneResult = currentEventType === "done" || currentEventType === "final" || currentEventType === "turn.final.completed"
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
