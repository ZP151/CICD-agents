import {
  type ChatMessage,
  type ChatWorkflowState,
} from "@mergepilot/core";
import { checkpointApplyMetadataFromToolResult } from "./chatToolExecution.js";
import { workflowStateForSession } from "./chatWorkflowState.js";
import {
  chatHistoryEntryFromSession,
  listStoredSessionsForActivity,
  loadSession,
  saveSession as saveStoredSession,
  storedSessionProjectLinkId,
  type ChatHistoryEntry,
  type StoredBubble,
  type StoredSession,
} from "./chatHistoryStore.js";

export interface ChatCheckpointActivity {
  id: string;
  sessionId: string;
  repoPath: string;
  projectLinkId?: string;
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

export async function saveSession(session: StoredSession): Promise<void> {
  await saveStoredSession(session, now);
}

export function saveNewSessionWithLocalFallback(session: StoredSession): void {
  // saveSession writes the local record before scheduling its cloud mirror.
  // Keep this detached because session creation is on the immediate SSE path.
  void saveSession(session);
}

export async function getHistory(sessionId: string, limit = 40): Promise<ChatMessage[]> {
  const session = await loadSession(sessionId);
  return (session?.messages ?? []).slice(-limit);
}

export async function getBubbles(sessionId: string): Promise<StoredBubble[]> {
  const session = await loadSession(sessionId);
  return session?.bubbles ?? [];
}

export async function getWorkflowState(sessionId: string): Promise<ChatWorkflowState | undefined> {
  const session = await loadSession(sessionId);
  return session ? workflowStateForSession(session) : undefined;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  session.messages.push({ role, content, timestamp: now() });
  if (session.messages.length > 200) session.messages = session.messages.slice(-200);
  await saveSession(session);
}

export async function appendBubble(sessionId: string, bubble: StoredBubble): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  session.bubbles.push(bubble);
  if (session.bubbles.length > 400) session.bubbles = session.bubbles.slice(-400);
  await saveSession(session);
}

export async function updateMetadata(
  sessionId: string,
  patch: { title?: string | null; pinned?: boolean },
): Promise<ChatHistoryEntry | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;
  if ("title" in patch) {
    const title = patch.title?.trim() ?? "";
    session.title = title || undefined;
    // MP-005/RA-019: a manual rename is locked and never overwritten by the
    // auto title; clearing the title releases the lock for a fresh auto run.
    session.titleSource = title ? "user" : undefined;
  }
  if (typeof patch.pinned === "boolean") {
    session.pinned = patch.pinned;
  }
  await saveSession(session);
  return chatHistoryEntryFromSession(session);
}

export async function listCheckpointActivity(limit = 50): Promise<ChatCheckpointActivity[]> {
  const sessions = await listStoredSessionsForActivity(limit);

  return sessions
    .flatMap((session) => session.bubbles
      .filter((bubble) => bubble.role === "tool" && bubble.checkpointId && bubble.checkpointPath)
      .map((bubble) => {
        const applyMetadata = checkpointApplyMetadataFromToolResult(bubble.toolName, bubble.toolResult);
        return {
          id: `${session.id}:${bubble.timestamp}:${bubble.toolName ?? "tool"}:${bubble.checkpointId}`,
          sessionId: session.id,
          repoPath: session.repoPath,
          projectLinkId: storedSessionProjectLinkId(session),
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

function now(): number {
  return Math.floor(Date.now() / 1000);
}
