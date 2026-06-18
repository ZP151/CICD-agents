import {
  type ChatMessage,
  type ChatWorkflowState,
  type CosmosStoredSession,
  type PendingToolAction,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "./llmSettings.js";
import type {
  ChatHistoryEntry,
  HistoryStore,
  InlineProjectLink,
  StoredBubble,
  StoredSession,
} from "./chatHistoryTypes.js";

export function chatHistoryEntryFromSession(session: StoredSession): ChatHistoryEntry {
  const last = session.messages[session.messages.length - 1];
  return {
    sessionId: session.id,
    preview: last ? last.content.slice(0, 100) : "",
    createdAt: session.createdAt,
    updatedAt: session.updatedAt ?? session.createdAt,
    title: session.title,
    pinned: Boolean(session.pinned),
  };
}

export function sortChatHistoryEntries(a: ChatHistoryEntry, b: ChatHistoryEntry): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

export function cosmosToStored(doc: CosmosStoredSession): StoredSession {
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    title: doc.title,
    pinned: doc.pinned,
    repoPath: doc.repoPath,
    projectLinkId: doc.projectLinkId,
    messages: doc.messages as ChatMessage[],
    bubbles: doc.bubbles as StoredBubble[],
    approvalProposal: doc.approvalProposal as PendingToolAction | undefined,
    pendingAction: doc.pendingAction as PendingToolAction | undefined,
    workflowState: doc.workflowState as ChatWorkflowState | undefined,
    llmConfig: doc.llmConfig as InlineLlmConfig | undefined,
    inlineProjectLink: doc.inlineProjectLink as InlineProjectLink | undefined,
  };
}

export function storedToCosmos(session: StoredSession): Omit<CosmosStoredSession, "userId" | "updatedAt"> {
  const normalized = normalizeSession(session);
  return {
    id: normalized.id,
    createdAt: normalized.createdAt,
    title: normalized.title,
    pinned: normalized.pinned,
    repoPath: normalized.repoPath,
    projectLinkId: normalized.projectLinkId,
    messages: normalized.messages,
    bubbles: normalized.bubbles,
    approvalProposal: normalized.approvalProposal,
    pendingAction: normalized.pendingAction,
    workflowState: normalized.workflowState,
    llmConfig: normalized.llmConfig,
    inlineProjectLink: normalized.inlineProjectLink,
  };
}

export function storedSessionProjectLinkId(session: Pick<StoredSession, "projectLinkId">): string | undefined {
  return session.projectLinkId;
}

export function normalizeStore(store: HistoryStore): HistoryStore {
  for (const session of Object.values(store)) {
    normalizeSession(session);
  }
  return store;
}

export function normalizeSession(session: StoredSession): StoredSession {
  const projectLinkId = storedSessionProjectLinkId(session);
  if (projectLinkId) {
    session.projectLinkId = projectLinkId;
  }
  return session;
}
