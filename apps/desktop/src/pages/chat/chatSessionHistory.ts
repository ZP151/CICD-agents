import type { ChatHistoryEntry, ChatMessageEntry } from "../../api.js";
import {
  conversationPartsFromAssistantBubble,
  toolCallPartFromSnapshot,
} from "../../chatBubbles.js";
import type { Bubble } from "./chat.types.js";
import { sortChatHistory } from "./chatHistory.js";
import {
  makeToolCallId,
  toolPartStateFromResult,
} from "./chatToolStreamState.js";
import { uid } from "./chatStreamDispatcher.js";

interface ChatMessageBubbleOptions {
  makeId?: () => string;
  makeToolCallId?: (toolName?: string, args?: Record<string, unknown>) => string;
}

export function chatMessagesToBubbles(
  messages: ChatMessageEntry[],
  options: ChatMessageBubbleOptions = {},
): Bubble[] {
  const makeId = options.makeId ?? uid;
  const makeToolId = options.makeToolCallId ?? makeToolCallId;

  return messages.map((message) => {
    const base = { id: makeId(), timestamp: message.timestamp };
    if (message.role === "user") {
      return { ...base, kind: "user" as const, text: message.content };
    }
    if (message.role === "tool") {
      const toolName = message.toolName ?? "unknown";
      const toolCallId = makeToolId(toolName, message.toolArgs);
      return {
        ...base,
        kind: "tool" as const,
        toolCallId,
        toolName,
        toolArgs: message.toolArgs,
        toolOk: message.toolOk,
        toolSummary: message.toolSummary,
        toolResult: message.toolResult,
        toolOpen: false,
        parts: [
          toolCallPartFromSnapshot({
            toolCallId,
            toolName,
            state: toolPartStateFromResult(message.toolOk),
            input: message.toolArgs,
            output: message.toolResult,
            summary: message.toolSummary,
          }),
        ],
      };
    }
    if (message.role === "system") {
      return { ...base, kind: "system" as const, text: message.content };
    }
    if (message.role === "error") {
      return { ...base, kind: "error" as const, text: message.content };
    }

    const meta: Bubble["meta"] = (
      message.riskLevel ||
      message.finalizationMode ||
      message.actionsTaken ||
      message.suggestions ||
      message.sources ||
      message.artifacts
    )
      ? {
          riskLevel: message.riskLevel,
          finalizationMode: message.finalizationMode,
          actionsTaken: message.actionsTaken,
          suggestions: message.suggestions,
          sources: message.sources,
          artifacts: message.artifacts,
        }
      : undefined;

    return {
      ...base,
      kind: "assistant" as const,
      text: message.content,
      parts: conversationPartsFromAssistantBubble({ text: message.content, meta }),
      meta,
    };
  });
}

export function upsertHistoryEntry(
  history: ChatHistoryEntry[],
  entry: ChatHistoryEntry,
): ChatHistoryEntry[] {
  return sortChatHistory(history.map((item) => (
    item.sessionId === entry.sessionId ? entry : item
  )));
}

export function removeHistoryEntry(
  history: ChatHistoryEntry[],
  sessionId: string,
): ChatHistoryEntry[] {
  return history.filter((item) => item.sessionId !== sessionId);
}

export function clampHistoryPage(page: number, historyLength: number, pageSize: number): number {
  const pageCount = Math.max(1, Math.ceil(historyLength / pageSize));
  return Math.min(Math.max(1, page), pageCount);
}
