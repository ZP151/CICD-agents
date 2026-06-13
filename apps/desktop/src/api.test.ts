import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStream, type ChatEventPayload } from "./api.js";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for streaming event");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("chatStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("emits SSE events as response chunks arrive instead of waiting for stream close", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const events: ChatEventPayload[] = [];
    chatStream(
      "stream a long answer",
      "C:\\repo",
      null,
      (event) => events.push(event),
    );
    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);

    const streamController = streamControllerRef.current;
    if (!streamController) throw new Error("Readable stream controller was not created");

    streamController.enqueue(encoder.encode(sse("ui.chunk", {
      type: "ui.chunk",
      chunk: { type: "text-delta", id: "answer-1", delta: "First visible chunk." },
    })));

    await waitFor(() => events.some((event) => event.uiChunk?.type === "text-delta"));
    expect(events.map((event) => event.type)).toEqual(["ui.chunk"]);
    expect(events[0]?.uiChunk).toEqual({
      type: "text-delta",
      id: "answer-1",
      delta: "First visible chunk.",
    });

    streamController.enqueue(encoder.encode(sse("done", {
      type: "done",
      result: {
        response: "First visible chunk. Final answer.",
        streamedResponse: "First visible chunk. Final answer.",
        finalizationMode: "agent_final",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
      },
    })));
    streamController.close();

    await waitFor(() => events.some((event) => event.type === "done"));
    expect(events.at(-1)?.result?.response).toBe("First visible chunk. Final answer.");
  });

  it("buffers partial SSE lines across arbitrary response chunk boundaries", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const events: ChatEventPayload[] = [];
    chatStream(
      "stream across split chunks",
      "C:\\repo",
      null,
      (event) => events.push(event),
    );
    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);
    const streamController = streamControllerRef.current;
    if (!streamController) throw new Error("Readable stream controller was not created");

    const payload = sse("ui.chunk", {
      type: "ui.chunk",
      chunk: { type: "text-delta", id: "split-text", delta: "Split chunk text." },
    });
    streamController.enqueue(encoder.encode(payload.slice(0, 17)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);

    streamController.enqueue(encoder.encode(payload.slice(17, 53)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);

    streamController.enqueue(encoder.encode(payload.slice(53)));
    await waitFor(() => events.length === 1);
    expect(events[0]?.type).toBe("ui.chunk");
    expect(events[0]?.uiChunk).toEqual({
      type: "text-delta",
      id: "split-text",
      delta: "Split chunk text.",
    });
    streamController.close();
  });
});
