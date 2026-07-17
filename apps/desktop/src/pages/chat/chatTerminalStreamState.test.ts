import { describe, expect, it, vi } from "vitest";
import type { ChatEventPayload } from "../../api.js";
import type { Bubble } from "./chat.types.js";
import {
  cancelledSystemBubble,
  doneFinalizationFromEvent,
  errorMessageFromEvent,
  handleCancelledEvent,
  handleDoneEvent,
  handleErrorEvent,
  type ChatTerminalStreamAdapter,
} from "./chatTerminalStreamState.js";

type TerminalAdapterTestDouble = ChatTerminalStreamAdapter & {
  bubbles: Bubble[];
  calls: string[];
  finalised?: { text: string; meta: Bubble["meta"] | undefined; streamedText?: string };
};

function makeAdapter(initialBubbles: Bubble[] = []): TerminalAdapterTestDouble {
  const adapter: TerminalAdapterTestDouble = {
    bubbles: initialBubbles,
    calls: [] as string[],
    uiChunkStreamAvailable: vi.fn(() => true),
    updateBubbles: vi.fn((updater: (prev: Bubble[]) => Bubble[]) => {
      adapter.bubbles = updater(adapter.bubbles);
      adapter.calls.push("updateBubbles");
    }),
    addBubble: vi.fn((bubble: Bubble) => {
      adapter.bubbles = [...adapter.bubbles, bubble];
      adapter.calls.push("addBubble");
    }),
    stopStreaming: vi.fn(() => adapter.calls.push("stopStreaming")),
    finaliseWithResponse: vi.fn((text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => {
      adapter.finalised = { text, meta, streamedText };
      adapter.calls.push("finaliseWithResponse");
    }),
    setBusy: vi.fn(() => adapter.calls.push("setBusy")),
    setStatusText: vi.fn(() => adapter.calls.push("setStatusText")),
    clearCancel: vi.fn(() => adapter.calls.push("clearCancel")),
    refreshHistory: vi.fn(() => adapter.calls.push("refreshHistory")),
    addErrorBubbleOnce: vi.fn(() => adapter.calls.push("addErrorBubbleOnce")),
  };
  return adapter;
}

describe("chat terminal stream state", () => {
  it("builds final assistant response metadata from done events", () => {
    const finalization = doneFinalizationFromEvent({
      type: "done",
      result: {
        response: "  Complete.  ",
        streamedResponse: "Complete.",
        riskLevel: "low",
        finalizationMode: "none",
        actionsTaken: ["Checked status"],
        suggestions: ["Review changes"],
      },
    } as ChatEventPayload, true);

    expect(finalization).toMatchObject({
      text: "Complete.",
      streamedText: "Complete.",
      meta: {
        riskLevel: "low",
        finalizationMode: "none",
        actionsTaken: ["Checked status"],
        suggestions: ["Review changes"],
      },
    });
  });

  it("handles done events and marks executing pending bubbles done", () => {
    const adapter = makeAdapter([
      { id: "p1", kind: "pending_confirm", pendingStatus: "executing" },
    ]);

    handleDoneEvent({
      type: "done",
      result: { response: "Done", riskLevel: "low" },
    } as ChatEventPayload, adapter, { refreshHistoryOnDone: true });

    expect(adapter.bubbles).toEqual([]);
    expect(adapter.finalised).toMatchObject({ text: "Done", streamedText: "Done" });
    expect(adapter.calls).toEqual([
      "updateBubbles",
      "stopStreaming",
      "finaliseWithResponse",
      "setBusy",
      "setStatusText",
      "clearCancel",
      "refreshHistory",
    ]);
  });

  it("handles cancelled and error terminal events", () => {
    expect(cancelledSystemBubble("cancel-1")).toEqual({
      id: "cancel-1",
      kind: "system",
      text: "Action cancelled.",
    });
    expect(errorMessageFromEvent({ type: "error" } as ChatEventPayload)).toBe("Something went wrong.");

    const cancelAdapter = makeAdapter();
    handleCancelledEvent(cancelAdapter, { makeId: () => "cancel-1" });
    expect(cancelAdapter.bubbles).toEqual([cancelledSystemBubble("cancel-1")]);

    const errorAdapter = makeAdapter([
      { id: "p1", kind: "pending_confirm", pendingStatus: "executing" },
    ]);
    handleErrorEvent(
      { type: "error", message: "Failed" } as ChatEventPayload,
      errorAdapter,
      { pendingBubbleId: "p1" },
    );
    expect(errorAdapter.bubbles).toEqual([]);
    expect(errorAdapter.addErrorBubbleOnce).toHaveBeenCalledWith("Failed");
  });
});
