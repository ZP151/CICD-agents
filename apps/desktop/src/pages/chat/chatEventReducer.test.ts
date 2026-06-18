import { describe, expect, it } from "vitest";
import type { ChatEventPayload } from "../../api.js";
import { reduceChatEvent } from "./chatEventReducer.js";

describe("reduceChatEvent", () => {
  it("marks ui.chunk as the canonical stream source", () => {
    const reduced = reduceChatEvent(
      { uiChunkStreamAvailable: false },
      { type: "ui.chunk", uiChunk: { type: "text-delta", id: "t1", delta: "hello" } } as ChatEventPayload,
    );

    expect(reduced.acceptance).toEqual({ kind: "accepted", source: "canonical" });
    expect(reduced.nextState.uiChunkStreamAvailable).toBe(true);
  });

  it("ignores legacy render events while canonical chunks are available", () => {
    const reduced = reduceChatEvent(
      { uiChunkStreamAvailable: true },
      { type: "assistant_delta", delta: "duplicate" } as ChatEventPayload,
    );

    expect(reduced.acceptance).toEqual({
      kind: "ignored",
      reason: "legacy-render-event-after-ui-chunk",
    });
    expect(reduced.nextState.uiChunkStreamAvailable).toBe(true);
  });

  it("keeps workflow events active during canonical streaming", () => {
    const reduced = reduceChatEvent(
      { uiChunkStreamAvailable: true },
      { type: "workflow_state", state: { status: "running" } } as ChatEventPayload,
    );

    expect(reduced.acceptance).toEqual({ kind: "accepted", source: "control" });
    expect(reduced.nextState.uiChunkStreamAvailable).toBe(true);
  });

  it("ends canonical availability on terminal chunks and terminal events", () => {
    expect(reduceChatEvent(
      { uiChunkStreamAvailable: true },
      { type: "ui.chunk", uiChunk: { type: "finish" } } as ChatEventPayload,
    ).nextState.uiChunkStreamAvailable).toBe(false);

    expect(reduceChatEvent(
      { uiChunkStreamAvailable: true },
      { type: "done" } as ChatEventPayload,
    ).nextState.uiChunkStreamAvailable).toBe(false);
  });
});
