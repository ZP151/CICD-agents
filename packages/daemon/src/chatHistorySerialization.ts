import {
  type ChatMessage,
  type CosmosStoredSession,
  type PendingToolAction,
  type TurnTimelineEvent,
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
  const last = lastDisplayableHistoryMessage(session.messages);
  const preview = last ? last.content.slice(0, 100) : "";
  const storedTitle = session.title && !isInternalHistoryText(session.title)
    ? session.title
    : undefined;
  const title = storedTitle ?? (preview || undefined);
  return {
    sessionId: session.id,
    preview,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt ?? session.createdAt,
    title,
    titleSource: session.titleSource,
    pinned: Boolean(session.pinned),
  };
}

function lastDisplayableHistoryMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => !isInternalHistoryText(message.content));
}

export function isInternalHistoryText(content: string): boolean {
  const text = content.trim();
  return /^\[(?:confirmed & executed|executed)\]\s+\w+\(/.test(text) ||
    /^WORKFLOW STEP (?:COMPLETED|FAILED):/i.test(text);
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
    timelineEvents: doc.timelineEvents as TurnTimelineEvent[] | undefined,
    approvalProposal: doc.approvalProposal as PendingToolAction | undefined,
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
    timelineEvents: normalized.timelineEvents,
    approvalProposal: normalized.approvalProposal,
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
  // Credential containment (ADR-0005, Phase 4 4a-1): the inline snapshot may
  // arrive from a request payload, but the PAT value is runtime-only and must
  // never reach local JSON or Cosmos. saveSession, storedToCosmos and
  // saveStoreSync all flow through here, so a single redaction covers every
  // session persistence path.
  if (session.inlineProjectLink?.adoPat) {
    session.inlineProjectLink = { ...session.inlineProjectLink, adoPat: "" };
  }
  return session;
}
