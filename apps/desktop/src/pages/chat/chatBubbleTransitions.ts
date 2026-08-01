import {
  appendToolOutputDeltaToConversationParts,
  assistantBubbleMetaFromUnknown,
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  finaliseAssistantResponseBubbles,
  mergeAssistantMetadataIntoLatestBubble,
  toolApprovalPartFromSnapshot,
  toolCallPartFromSnapshot,
  upsertToolCallPart,
  type ToolCallPartSnapshot,
} from "../../chatBubbles.js";
import type { ApprovalRequest, Bubble } from "./chat.types.js";
import { makeToolCallId } from "./chatToolStreamState.js";

type IdFactory = () => string;

export function addErrorBubbleOnceTransition(
  prev: Bubble[],
  message: string,
  makeId: IdFactory,
): Bubble[] {
  const text = message || "Something went wrong.";
  const last = prev[prev.length - 1];
  if (last?.kind === "error" && last.text === text) return prev;
  return [...prev, { id: makeId(), kind: "error", text }];
}

export function finaliseWithResponseTransition(
  prev: Bubble[],
  cleanText: string,
  meta: Bubble["meta"] | undefined,
  streamedText: string | undefined,
  makeId: IdFactory,
): Bubble[] {
  return finaliseAssistantResponseBubbles(
    prev,
    cleanText,
    meta,
    streamedText,
    (text, bubbleMeta) => ({
      id: makeId(),
      kind: "assistant",
      text,
      parts: conversationPartsFromAssistantBubble({ text, meta: bubbleMeta }),
      streaming: false,
      meta: bubbleMeta,
    }),
  );
}

export function showApprovalRequestTransition(
  prev: Bubble[],
  approval: ApprovalRequest,
  makeId: IdFactory,
  turnId?: string,
): Bubble[] {
  const alreadyWaiting = prev.some(
    (bubble) =>
      bubble.kind === "pending_confirm" &&
      bubble.pendingStatus === "waiting" &&
      bubble.pendingTool === approval.action.tool &&
      stableJson(bubble.pendingArgs ?? {}) === stableJson(approval.action.args ?? {}),
  );
  if (alreadyWaiting) return prev;
  return [
    ...prev,
    {
      id: makeId(),
      kind: "pending_confirm",
      pendingTool: approval.action.tool,
      pendingArgs: approval.action.args,
      // The action is the only text that belongs in the approval card. The
      // model's full response becomes the final conclusion after the Turn,
      // rather than an accidental long-form plan inside Working.
      pendingDescription: approval.action.description || approval.explanation,
      pendingNextHint: approval.action.nextHint,
      pendingWorkflow: approval.action.workflow,
      pendingReadiness: approval.action.readiness,
      pendingPreflight: approval.action.preflight,
      pendingStatus: "waiting",
      riskLevel: approval.riskLevel,
      turnId,
      parts: [
        toolApprovalPartFromSnapshot({
          approvalId: approval.id,
          toolName: approval.action.tool,
          description: approval.action.description || approval.explanation,
          args: approval.action.args,
          riskLevel: approval.riskLevel,
        }),
      ],
    },
  ];
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonValue(entry)]),
  );
}

export function appendVisibleAssistantDeltaTransition(
  prev: Bubble[],
  delta: string,
  makeId: IdFactory,
): Bubble[] {
  if (!delta) return prev;
  const reversedIdx = [...prev].reverse().findIndex((bubble) => bubble.kind === "assistant" && bubble.streaming);
  if (reversedIdx !== -1) {
    const realIdx = prev.length - 1 - reversedIdx;
    return prev.map((bubble, index) => {
      if (index !== realIdx || bubble.kind !== "assistant") return bubble;
      return {
        ...bubble,
        text: `${bubble.text ?? ""}${delta}`,
      };
    });
  }
  return [
    ...prev,
    {
      id: makeId(),
      kind: "assistant",
      text: delta,
      streaming: true,
    },
  ];
}

export function stopStreamingTransition(prev: Bubble[]): Bubble[] {
  const reversedIdx = [...prev].reverse().findIndex((bubble) => bubble.kind === "assistant" && bubble.streaming);
  if (reversedIdx === -1) return prev;
  const realIdx = prev.length - 1 - reversedIdx;
  const bubble = prev[realIdx];
  if (!bubble || bubble.kind !== "assistant") return prev;
  const streamedText = bubble.text?.trim() || conversationTextFromParts(bubble.parts).trim();
  if (streamedText) {
    return prev.map((item, index) =>
      index === realIdx ? { ...bubble, text: bubble.text || streamedText, streaming: false } : item,
    );
  }
  return prev.filter((_, index) => index !== realIdx);
}

export function upsertToolBubbleTransition(
  prev: Bubble[],
  snapshot: ToolCallPartSnapshot,
  options: {
    ok?: boolean;
    result?: unknown;
    open?: boolean;
    liveOutput?: string;
    turnId?: string;
    sequence?: number;
    timestamp?: number;
    connector?: Bubble["connector"];
  },
  makeId: IdFactory,
): Bubble[] {
  if (!snapshot.toolName) return prev;
  const existingIndex = prev.findIndex(
    (bubble) =>
      bubble.kind === "tool" &&
      (bubble.toolCallId === snapshot.toolCallId ||
        (!bubble.toolCallId && bubble.toolName === snapshot.toolName && bubble.toolOk === undefined)),
  );
  const nextPart = toolCallPartFromSnapshot(snapshot);
  if (existingIndex === -1) {
    return [
      ...prev,
      {
        id: makeId(),
        kind: "tool",
        toolCallId: snapshot.toolCallId,
        toolName: snapshot.toolName,
        toolArgs: snapshot.input && typeof snapshot.input === "object"
          ? (snapshot.input as Record<string, unknown>)
          : undefined,
        toolOk: options.ok,
        toolSummary: snapshot.summary,
        toolResult: options.result ?? snapshot.output,
        toolOpen: options.open ?? false,
        toolLiveOutput: options.liveOutput,
        turnId: options.turnId,
        turnSequence: options.sequence,
        timestamp: options.timestamp,
        connector: options.connector,
        parts: [nextPart],
      },
    ];
  }

  const existing = prev[existingIndex]!;
  if (
    options.turnId &&
    existing.turnId === options.turnId &&
    typeof options.sequence === "number" &&
    typeof existing.turnSequence === "number" &&
    options.sequence < existing.turnSequence
  ) return prev;

  return prev.map((bubble, index) => {
    if (index !== existingIndex) return bubble;
    return {
      ...bubble,
      toolCallId: snapshot.toolCallId,
      toolName: snapshot.toolName,
      toolArgs: snapshot.input && typeof snapshot.input === "object"
        ? (snapshot.input as Record<string, unknown>)
        : bubble.toolArgs,
      toolOk: options.ok ?? bubble.toolOk,
      toolSummary: snapshot.summary ?? bubble.toolSummary,
      toolResult: options.result ?? snapshot.output ?? bubble.toolResult,
      toolOpen: options.open ?? bubble.toolOpen,
      toolLiveOutput: options.liveOutput ?? bubble.toolLiveOutput,
      turnId: options.turnId ?? bubble.turnId,
      turnSequence: options.sequence ?? bubble.turnSequence,
      timestamp: options.timestamp ?? bubble.timestamp,
      connector: options.connector ?? bubble.connector,
      parts: upsertToolCallPart(bubble.parts, snapshot),
    };
  });
}

export function appendToolOutputDeltaTransition(
  prev: Bubble[],
  toolName: string | undefined,
  stream: "stdout" | "stderr" | undefined,
  delta: string | undefined,
  toolCallId: string | undefined,
  makeId: IdFactory,
): Bubble[] {
  if (!toolName || !delta) return prev;
  const prefix = stream === "stderr" ? "[stderr] " : "";
  const idx = [...prev].reverse().findIndex(
    (bubble) =>
      bubble.kind === "tool" &&
      (toolCallId ? bubble.toolCallId === toolCallId : bubble.toolName === toolName) &&
      bubble.toolOk === undefined,
  );
  if (idx === -1 && toolCallId) {
    return [
      ...prev,
      {
        id: makeId(),
        kind: "tool",
        toolCallId,
        toolName,
        toolOpen: true,
        toolLiveOutput: `${prefix}${delta}`.slice(-12000),
        parts: appendToolOutputDeltaToConversationParts(
          undefined,
          { toolCallId, toolName },
          stream,
          delta,
        ),
      },
    ];
  }
  if (idx === -1) return prev;
  const realIdx = prev.length - 1 - idx;
  return prev.map((bubble, index) => {
    if (index !== realIdx) return bubble;
    const resolvedToolCallId = bubble.toolCallId ?? toolCallId ?? makeToolCallId(toolName);
    return {
      ...bubble,
      toolCallId: resolvedToolCallId,
      toolLiveOutput: `${bubble.toolLiveOutput ?? ""}${prefix}${delta}`.slice(-12000),
      toolOpen: true,
      parts: appendToolOutputDeltaToConversationParts(
        bubble.parts,
        {
          toolCallId: resolvedToolCallId,
          toolName,
          input: bubble.toolArgs,
          summary: bubble.toolSummary,
        },
        stream,
        delta,
      ),
    };
  });
}

export function mergeAssistantMetadataTransition(prev: Bubble[], metadata: unknown): Bubble[] {
  const meta = assistantBubbleMetaFromUnknown(metadata);
  if (!meta) return prev;
  return mergeAssistantMetadataIntoLatestBubble(prev, meta);
}
