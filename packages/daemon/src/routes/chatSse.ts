import type { FastifyReply } from "fastify";
import { ChatUiChunkAdapter, type ChatEvent } from "@mergepilot/core";
import { chatEventToSseEvents, sessionStartedEvent } from "../chatEvents.js";

export interface ChatSseWriter {
  send(event: string, payload: unknown): void;
  startTurn(turnId: string): void;
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
  let activeTurn: { id: string; nextSequence: number; startedAt: number } | undefined;

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
    startTurn(turnId) {
      activeTurn = { id: turnId, nextSequence: 1, startedAt: Date.now() };
      send("turn.started", {
        type: "turn.started",
        turnId,
        sequence: 0,
        emittedAt: activeTurn.startedAt,
        sessionId,
      });
    },
    sendChatEvent(event) {
      const enriched = enrichTurnEvent(event, activeTurn);
      for (const sse of chatEventToSseEvents(enriched)) send(sse.event, sse.payload);
      for (const chunk of uiAdapter.push(enriched)) sendUiChunk(chunk);
      const terminal = turnTerminalEvent(enriched, activeTurn);
      if (terminal) send(terminal.type, terminal.payload);
    },
    end() {
      reply.raw.end();
    },
  };
}

function enrichTurnEvent(
  event: ChatEvent,
  turn: { id: string; nextSequence: number; startedAt: number } | undefined,
): ChatEvent {
  if (!turn) return event;
  const emittedAt = Date.now();
  return {
    ...event,
    turnId: turn.id,
    sequence: turn.nextSequence++,
    emittedAt,
    elapsedMs: emittedAt - turn.startedAt,
  } as unknown as ChatEvent;
}

function turnTerminalEvent(
  event: ChatEvent,
  turn: { id: string; startedAt: number } | undefined,
): { type: string; payload: Record<string, unknown> } | undefined {
  const enriched = event as ChatEvent & {
    turnId?: string;
    sequence?: number;
    emittedAt?: number;
    elapsedMs?: number;
  };
  if (!enriched.turnId) return undefined;
  const status = event.type === "done"
    ? "completed"
    : event.type === "cancelled"
      ? "cancelled"
      : event.type === "error"
        ? "failed"
        : undefined;
  if (!status) return undefined;
  return {
    type: `turn.${status}`,
    payload: {
      type: `turn.${status}`,
      turnId: enriched.turnId,
      sequence: enriched.sequence,
      emittedAt: enriched.emittedAt,
      elapsedMs: turn ? Date.now() - turn.startedAt : enriched.elapsedMs,
      status,
    },
  };
}

export function isTerminalChatEvent(event: ChatEvent): boolean {
  return event.type === "done" || event.type === "error" || event.type === "cancelled";
}
