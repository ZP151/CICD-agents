import type { ChatEventPayload } from "../../api.js";
import {
  upsertToolCallPart,
} from "../../chatBubbles.js";
import type { Bubble } from "./chat.types.js";

export function makeToolCallId(toolName?: string, args?: Record<string, unknown>): string {
  if (args !== undefined) return `tool-${toolName ?? "unknown"}-${hashShort(JSON.stringify(args ?? {}))}`;
  return `tool-${toolName ?? "unknown"}-${uid()}`;
}

export function toolPartStateFromResult(toolOk?: boolean): "result" | "error" | "running" {
  if (toolOk === false) return "error";
  if (toolOk === true) return "result";
  return "running";
}

export function updateToolEndBubble(prev: Bubble[], ev: ChatEventPayload): Bubble[] {
  const idx = [...prev].reverse().findIndex(
    (bubble) => bubble.kind === "tool" && bubble.toolName === ev.name && bubble.toolOk === undefined,
  );
  if (idx === -1) return prev;
  const realIdx = prev.length - 1 - idx;
  return prev.map((bubble, index) => {
    if (index !== realIdx) return bubble;
    const toolName = bubble.toolName ?? ev.name ?? "unknown";
    const toolCallId = ev.toolCallId ?? bubble.toolCallId ?? makeToolCallId(toolName, bubble.toolArgs);
    return {
      ...bubble,
      toolCallId,
      toolOk: ev.ok,
      toolSummary: ev.summary,
      toolResult: ev.toolResult,
      toolOpen: false,
      parts: upsertToolCallPart(bubble.parts, {
        toolCallId,
        toolName,
        state: toolPartStateFromResult(ev.ok),
        input: bubble.toolArgs,
        output: ev.toolResult,
        summary: ev.summary,
      }),
    };
  });
}

export function markExecutingPendingBubblesDone(prev: Bubble[]): Bubble[] {
  return prev.filter(
    (bubble) => !(bubble.kind === "pending_confirm" && bubble.pendingStatus === "executing"),
  );
}

export function markPendingBubbleDone(prev: Bubble[], bubbleId: string | undefined): Bubble[] {
  if (!bubbleId) return prev;
  return prev.filter(
    (bubble) => !(bubble.id === bubbleId && bubble.pendingStatus === "executing"),
  );
}

export function markPendingBubbleCancelled(prev: Bubble[], bubbleId: string | undefined): Bubble[] {
  if (!bubbleId) return prev;
  return prev.filter((bubble) => bubble.id !== bubbleId);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function hashShort(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
