import {
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  finaliseAssistantResponseBubbles,
  toolApprovalPartFromSnapshot,
} from "../../chatBubbles.js";
import type { ApprovalRequest, Bubble } from "./chat.types.js";

type IdFactory = () => string;

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
