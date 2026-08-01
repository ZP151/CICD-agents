import type { ChatEventPayload, ChatHistoryEntry, ChatMessageEntry, ChatSessionMessages } from "../../api.js";
import { conversationPartsFromAssistantBubble } from "../../chatBubbles.js";
import type { Bubble } from "./chat.types.js";
import { sortChatHistory } from "./chatHistory.js";
import { uid } from "./chatStreamDispatcher.js";
import { applyTurnTimelineEvent, upsertTurnStartedTranscript } from "./chatTurnTranscript.js";

interface ChatMessageBubbleOptions {
  makeId?: () => string;
  makeToolCallId?: (toolName?: string, args?: Record<string, unknown>) => string;
}

export function chatMessagesToBubbles(
  payload: ChatMessageEntry[] | ChatSessionMessages,
  options: ChatMessageBubbleOptions = {},
): Bubble[] {
  const messages = Array.isArray(payload) ? payload : payload.bubbles;
  const restored = Array.isArray(payload)
    ? undefined
    : restoreTimelineAwareHistory(messages, payload.timelineEvents, options);
  if (restored) return restored;
  return legacyChatMessagesToBubbles(messages, options);
}

function legacyChatMessagesToBubbles(
  messages: ChatMessageEntry[],
  options: ChatMessageBubbleOptions = {},
): Bubble[] {
  const makeId = options.makeId ?? uid;
  void options.makeToolCallId;

  const bubbles: Bubble[] = [];
  let restoredTurn: { id: string; startedAt: number; activityIndex?: number } | null = null;
  let latestTranscriptIndex: number | undefined;

  for (const [index, message] of messages.entries()) {
    const timestamp = normalizeTimestamp(message.timestamp);
    const base = { id: makeId(), timestamp };
    if (message.role === "user") {
      const bubble = { ...base, kind: "user" as const, text: message.content };
      bubbles.push(bubble);
      restoredTurn = { id: `restored-turn-${index}-${timestamp}`, startedAt: timestamp };
      continue;
    }

    const activityIndex = ensureRestoredTurnActivity(bubbles, restoredTurn, makeId);
    if (activityIndex !== undefined) latestTranscriptIndex = activityIndex;
    if (message.role === "tool") {
      appendRestoredToolToTranscript(bubbles, activityIndex ?? latestTranscriptIndex, message);
      continue;
    }
    if (message.role === "system") {
      const bubble = { ...base, kind: "system" as const, text: message.content };
      bubbles.push(bubble);
      if (isRestoredTurnTerminal(message)) {
        finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "cancelled", timestamp);
        restoredTurn = null;
      }
      continue;
    }
    if (message.role === "error") {
      const bubble = { ...base, kind: "error" as const, text: message.content };
      bubbles.push(bubble);
      finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "failed", timestamp);
      restoredTurn = null;
      continue;
    }

    const meta: NonNullable<Bubble["meta"]> = {
      riskLevel: message.riskLevel,
      finalizationMode: message.finalizationMode,
      actionsTaken: message.actionsTaken,
      suggestions: message.suggestions,
      sources: message.sources,
      artifacts: message.artifacts,
      timestamp,
    };

    bubbles.push({
      ...base,
      kind: "assistant" as const,
      text: message.content,
      parts: conversationPartsFromAssistantBubble({ text: message.content, meta }),
      meta,
    });
    finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "completed", timestamp);
    restoredTurn = null;
  }

  // A persisted transcript cannot resume an in-flight request. Close an
  // incomplete final turn instead of restoring a timer that will run forever.
  if (restoredTurn) {
    const activityIndex = ensureRestoredTurnActivity(bubbles, restoredTurn, makeId);
    finalizeRestoredTurn(
      bubbles,
      activityIndex,
      restoredTurn,
      "failed",
      restoredTurn.startedAt,
    );
  }

  return bubbles;
}

function restoreTimelineAwareHistory(
  messages: ChatMessageEntry[],
  timelineEvents: ChatSessionMessages["timelineEvents"],
  options: ChatMessageBubbleOptions,
): Bubble[] | undefined {
  const events = (timelineEvents ?? [])
    .filter((event) => event.turnId && Number.isFinite(event.sequence) && Number.isFinite(event.emittedAt))
    .sort((left, right) => left.emittedAt - right.emittedAt || left.sequence - right.sequence);
  const byTurn = new Map<string, typeof events>();
  for (const event of events) {
    const turnEvents = byTurn.get(event.turnId) ?? [];
    turnEvents.push(event);
    byTurn.set(event.turnId, turnEvents);
  }
  const turns = [...byTurn.values()]
    .map((turnEvents) => [...turnEvents].sort((left, right) => left.sequence - right.sequence))
    .filter((turnEvents) => turnEvents.some((event) => event.type === "turn.started"))
    .sort((left, right) => left[0]!.emittedAt - right[0]!.emittedAt);
  if (turns.length === 0) return undefined;

  const makeId = options.makeId ?? uid;
  const canonicalTurnsByUserIndex = matchTurnsToUserMessages(messages, turns);
  const bubbles: Bubble[] = [];
  let restoredTurn: { id: string; startedAt: number; activityIndex?: number } | null = null;
  let latestTranscriptIndex: number | undefined;
  let canonicalTurnOwnsFollowingMessages = false;

  for (const [index, message] of messages.entries()) {
    const timestamp = normalizeTimestamp(message.timestamp);
    const base = { id: makeId(), timestamp };
    if (message.role === "user") {
      canonicalTurnOwnsFollowingMessages = false;
      bubbles.push({ ...base, kind: "user", text: message.content });
      const turnEvents = canonicalTurnsByUserIndex.get(index);
      if (turnEvents) {
        appendCanonicalTurn(bubbles, turnEvents, makeId);
        canonicalTurnOwnsFollowingMessages = true;
        restoredTurn = null;
        latestTranscriptIndex = undefined;
      } else {
        restoredTurn = { id: `restored-turn-${index}-${timestamp}`, startedAt: timestamp };
      }
      continue;
    }

    // Current daemons persist bubbles for compatibility as well as Timeline
    // events. A canonical Turn owns those compatibility records so the
    // command list and final response cannot appear twice after restore.
    if (canonicalTurnOwnsFollowingMessages) continue;

    const activityIndex = ensureRestoredTurnActivity(bubbles, restoredTurn, makeId);
    if (activityIndex !== undefined) latestTranscriptIndex = activityIndex;
    if (message.role === "tool") {
      appendRestoredToolToTranscript(bubbles, activityIndex ?? latestTranscriptIndex, message);
      continue;
    }
    if (message.role === "system") {
      bubbles.push({ ...base, kind: "system", text: message.content });
      if (isRestoredTurnTerminal(message)) {
        finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "cancelled", timestamp);
        restoredTurn = null;
      }
      continue;
    }
    if (message.role === "error") {
      bubbles.push({ ...base, kind: "error", text: message.content });
      finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "failed", timestamp);
      restoredTurn = null;
      continue;
    }

    const meta: NonNullable<Bubble["meta"]> = {
      riskLevel: message.riskLevel,
      finalizationMode: message.finalizationMode,
      actionsTaken: message.actionsTaken,
      suggestions: message.suggestions,
      sources: message.sources,
      artifacts: message.artifacts,
      timestamp,
    };
    bubbles.push({
      ...base,
      kind: "assistant",
      text: message.content,
      parts: conversationPartsFromAssistantBubble({ text: message.content, meta }),
      meta,
    });
    finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "completed", timestamp);
    restoredTurn = null;
  }

  if (restoredTurn) {
    const activityIndex = ensureRestoredTurnActivity(bubbles, restoredTurn, makeId);
    finalizeRestoredTurn(bubbles, activityIndex, restoredTurn, "failed", restoredTurn.startedAt);
  }
  return bubbles;
}

function matchTurnsToUserMessages(
  messages: ChatMessageEntry[],
  turns: Array<NonNullable<ChatSessionMessages["timelineEvents"]>>,
): Map<number, NonNullable<ChatSessionMessages["timelineEvents"]>> {
  const users = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user")
    .map(({ message, index }) => ({ index, at: normalizeTimestamp(message.timestamp) }));
  const unmatched = new Set(users.map((user) => user.index));
  const byUserIndex = new Map<number, NonNullable<ChatSessionMessages["timelineEvents"]>>();

  for (const turnEvents of turns) {
    const startedAt = turnEvents.find((event) => event.type === "turn.started")!.emittedAt;
    const preceding = users
      .filter((user) => unmatched.has(user.index) && user.at <= startedAt)
      .at(-1);
    const user = preceding ?? users.find((candidate) => unmatched.has(candidate.index));
    if (!user) continue;
    unmatched.delete(user.index);
    byUserIndex.set(user.index, turnEvents);
  }
  return byUserIndex;
}

function appendCanonicalTurn(
  bubbles: Bubble[],
  turnEvents: NonNullable<ChatSessionMessages["timelineEvents"]>,
  makeId: () => string,
): void {
  const started = turnEvents.find((event) => event.type === "turn.started")!;
  let turnBubbles = upsertTurnStartedTranscript([], started as ChatEventPayload, makeId);
  for (const event of turnEvents) {
    if (event.type === "turn.started") continue;
    turnBubbles = applyTurnTimelineEvent(turnBubbles, event as ChatEventPayload);
  }
  bubbles.push(...turnBubbles);

  const final = [...turnEvents].reverse().find((event) => event.type === "turn.final.completed");
  const finalText = final?.finalText?.trim();
  if (finalText) {
    const finalTimestamp = final?.emittedAt ?? started.emittedAt;
    const meta = { timestamp: finalTimestamp };
    bubbles.push({
      id: makeId(),
      kind: "assistant",
      text: finalText,
      timestamp: finalTimestamp,
      parts: conversationPartsFromAssistantBubble({ text: finalText, meta }),
      meta,
    });
  }
}

function ensureRestoredTurnActivity(
  bubbles: Bubble[],
  turn: { id: string; startedAt: number; activityIndex?: number } | null,
  makeId: () => string,
): number | undefined {
  if (!turn) return undefined;
  if (turn.activityIndex !== undefined) return turn.activityIndex;
  turn.activityIndex = bubbles.length;
  bubbles.push({
    id: makeId(),
    kind: "system",
    text: "Working",
    turnId: turn.id,
    timestamp: turn.startedAt,
    turnTranscript: {
      startedAt: turn.startedAt,
      status: "working",
      executionSealed: false,
      blocks: [],
      pendingGroups: {},
    },
  });
  return turn.activityIndex;
}

function finalizeRestoredTurn(
  bubbles: Bubble[],
  activityIndex: number | undefined,
  turn: { id: string; startedAt: number } | null,
  status: "completed" | "cancelled" | "failed",
  finishedAt: number,
): void {
  if (activityIndex === undefined || !turn) return;
  const activity = bubbles[activityIndex];
  if (!activity?.turnTranscript) return;
  const elapsedMs = Math.max(0, finishedAt - turn.startedAt);
  const label = status === "completed" ? "Worked" : status === "cancelled" ? "Cancelled" : "Stopped";
  bubbles[activityIndex] = {
    ...activity,
    text: `${label} for ${formatDuration(elapsedMs)}`,
    turnTranscript: {
      ...activity.turnTranscript,
      status,
      executionSealed: true,
      elapsedMs,
    },
  };
}

function appendRestoredToolToTranscript(
  bubbles: Bubble[],
  activityIndex: number | undefined,
  message: ChatMessageEntry,
): void {
  if (activityIndex === undefined) return;
  const activity = bubbles[activityIndex];
  if (!activity?.turnTranscript) return;
  const toolName = message.toolName ?? "command";
  const command = restoredCommandLabel(toolName, message.toolArgs);
  const groupId = "restored-commands";
  const existing = activity.turnTranscript.blocks.find((block) => block.kind === "tool_group" && block.id === groupId);
  const commandEntry = {
    id: `restored-${activity.turnTranscript.blocks.length}-${toolName}`,
    name: toolName,
    args: message.toolArgs,
    command,
    status: message.toolOk === false ? "failed" as const : "succeeded" as const,
    summary: message.toolSummary,
  };
  const blocks = existing
    ? activity.turnTranscript.blocks.map((block) => block.kind === "tool_group" && block.id === groupId
      ? { ...block, commands: [...block.commands, commandEntry] }
      : block)
    : [...activity.turnTranscript.blocks, {
      kind: "tool_group" as const,
      id: groupId,
      label: "Ran commands" as const,
      commands: [commandEntry],
    }];
  bubbles[activityIndex] = {
    ...activity,
    turnTranscript: { ...activity.turnTranscript, blocks },
  };
}

function restoredCommandLabel(toolName: string, args: Record<string, unknown> | undefined): string {
  if (typeof args?.["command"] === "string" && args.command.trim()) return args.command.trim();
  if (!args || Object.keys(args).length === 0) return toolName;
  try {
    const serialized = JSON.stringify(args);
    return serialized.length > 140 ? `${toolName} ${serialized.slice(0, 137)}…` : `${toolName} ${serialized}`;
  } catch {
    return toolName;
  }
}

function isRestoredTurnTerminal(message: ChatMessageEntry): boolean {
  return /^action cancelled\.?$/i.test(message.content.trim());
}

function normalizeTimestamp(timestamp: number): number {
  return timestamp > 0 && timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatDuration(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
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
