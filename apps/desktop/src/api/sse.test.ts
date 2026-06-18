import { describe, expect, it } from "vitest";
import { readSseJsonStream } from "./sse.js";

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }));
}

describe("readSseJsonStream", () => {
  it("parses named SSE JSON events across transport chunks", async () => {
    const messages: Array<{ event: string; data: unknown }> = [];
    const response = responseFromChunks([
      'event: ui.chunk\ndata: {"type":"ui.chunk","chunk":{"type":"text-delta","delta":"Hel',
      'lo","id":"chat-1"}}\n\n',
      'event: final\ndata: {"type":"final","result":{"response":"Hello"}}\n\n',
    ]);

    await readSseJsonStream(response, (message) => messages.push(message));

    expect(messages).toEqual([
      {
        event: "ui.chunk",
        data: { type: "ui.chunk", chunk: { type: "text-delta", delta: "Hello", id: "chat-1" } },
      },
      {
        event: "final",
        data: { type: "final", result: { response: "Hello" } },
      },
    ]);
  });

  it("ignores malformed JSON data and continues with later events", async () => {
    const messages: Array<{ event: string; data: unknown }> = [];
    const response = responseFromChunks([
      "event: progress\ndata: {not-json}\n\n",
      'event: progress\ndata: {"type":"progress","message":"Working"}\n\n',
    ]);

    await readSseJsonStream(response, (message) => messages.push(message));

    expect(messages).toEqual([
      { event: "progress", data: { type: "progress", message: "Working" } },
    ]);
  });
});
