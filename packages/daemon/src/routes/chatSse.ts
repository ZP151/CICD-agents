import type { FastifyReply } from "fastify";
import { ChatUiChunkAdapter, type ChatEvent } from "@mergepilot/core";
import { chatEventToSseEvents, sessionStartedEvent } from "../chatEvents.js";

export interface ChatSseWriter {
  send(event: string, payload: unknown): void;
  sendChatEvent(event: ChatEvent): void;
  end(): void;
}

export function createChatSseWriter(reply: FastifyReply, sessionId?: string): ChatSseWriter {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("Access-Control-Allow-Origin", "*");
  if (sessionId) reply.raw.setHeader("X-Chat-Session-Id", sessionId);
  reply.raw.flushHeaders();

  const uiAdapter = new ChatUiChunkAdapter();

  const send = (event: string, payload: unknown): void => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const sendUiChunk = (chunk: unknown): void => send("ui.chunk", { type: "ui.chunk", chunk });

  for (const chunk of uiAdapter.start()) sendUiChunk(chunk);
  if (sessionId) {
    for (const sse of sessionStartedEvent(sessionId)) send(sse.event, sse.payload);
  }

  return {
    send,
    sendChatEvent(event) {
      for (const sse of chatEventToSseEvents(event)) send(sse.event, sse.payload);
      for (const chunk of uiAdapter.push(event)) sendUiChunk(chunk);
    },
    end() {
      reply.raw.end();
    },
  };
}

export function isTerminalChatEvent(event: ChatEvent): boolean {
  return event.type === "done" || event.type === "error" || event.type === "cancelled";
}
