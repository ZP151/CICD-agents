import type { ChatEventPayload } from "../../api.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import type { Bubble } from "./chat.types.js";

export interface ChatTerminalStreamAdapter {
  uiChunkStreamAvailable: () => boolean;
  updateBubbles: (updater: (prev: Bubble[]) => Bubble[]) => void;
  addBubble: (bubble: Bubble) => void;
  stopStreaming: () => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: (busy: boolean) => void;
  setStatusText: (status: string | null) => void;
  clearCancel: () => void;
  refreshHistory: () => void;
  addErrorBubbleOnce: (text: string) => void;
}

export interface ChatTerminalStreamOptions {
  pendingBubbleId?: string;
  refreshHistoryOnDone?: boolean;
  makeId: () => string;
}

export function handleDoneEvent(
  ev: ChatEventPayload,
  adapter: ChatTerminalStreamAdapter,
  options: Pick<ChatTerminalStreamOptions, "refreshHistoryOnDone"> = {},
): void {
  adapter.updateBubbles((prev) => reduceChatBubbles(prev, { type: "mark_executing_pending_done" }, noopId));
  const finalization = doneFinalizationFromEvent(ev, adapter.uiChunkStreamAvailable());
  adapter.stopStreaming();
  adapter.finaliseWithResponse(
    finalization.text,
    finalization.meta,
    finalization.streamedText,
  );
  adapter.setBusy(false);
  adapter.setStatusText(null);
  adapter.clearCancel();
  if (options.refreshHistoryOnDone) adapter.refreshHistory();
}

export function handleCancelledEvent(
  adapter: ChatTerminalStreamAdapter,
  options: Pick<ChatTerminalStreamOptions, "pendingBubbleId" | "makeId">,
): void {
  adapter.stopStreaming();
  if (options.pendingBubbleId) {
    adapter.updateBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_cancelled",
      id: options.pendingBubbleId,
    }, options.makeId));
  } else {
    adapter.addBubble(cancelledSystemBubble(options.makeId()));
  }
  adapter.setBusy(false);
  adapter.setStatusText(null);
  adapter.clearCancel();
}

export function handleErrorEvent(
  ev: ChatEventPayload,
  adapter: ChatTerminalStreamAdapter,
  options: Pick<ChatTerminalStreamOptions, "pendingBubbleId"> = {},
): void {
  adapter.stopStreaming();
  if (options.pendingBubbleId) {
    adapter.updateBubbles((prev) => reduceChatBubbles(prev, {
      type: "mark_pending_cancelled",
      id: options.pendingBubbleId,
    }, noopId));
  }
  adapter.addErrorBubbleOnce(errorMessageFromEvent(ev));
  adapter.setBusy(false);
  adapter.setStatusText(null);
  adapter.clearCancel();
}

export function doneFinalizationFromEvent(
  ev: ChatEventPayload,
  uiChunkStreamAvailable: boolean,
): {
  text: string;
  meta: Bubble["meta"] | undefined;
  streamedText?: string;
} {
  const meta: Bubble["meta"] = ev.result
    ? {
        riskLevel: ev.result.riskLevel,
        finalizationMode: ev.result.finalizationMode,
        actionsTaken: ev.result.actionsTaken,
        suggestions: ev.result.suggestions,
        sources: ev.result.sources,
        artifacts: ev.result.artifacts,
      }
    : undefined;
  const text = ev.result?.response?.trim() ?? "";
  return {
    text,
    meta,
    streamedText: ev.result?.streamedResponse ?? (uiChunkStreamAvailable ? text : undefined),
  };
}

export function cancelledSystemBubble(id: string): Bubble {
  return { id, kind: "system", text: "Action cancelled." };
}

export function errorMessageFromEvent(ev: ChatEventPayload): string {
  return ev.message ?? "Something went wrong.";
}

function noopId(): string {
  return "";
}
