import { createUIMessageStreamResponse, type ModelMessage } from "ai";
import type { Runner } from "./runner.js";
import type { SessionEvent, SessionStore } from "./session.js";
import { sessionEventsToUIStream } from "./ui-stream.js";

export interface ConversationOptions {
  runner: Runner;
  sessionId?: string;
  store?: SessionStore;
}

/**
 * Thin stateful wrapper over a composed Runner.
 * Manages `messages` — updates from `done` events.
 * No compaction/retry/hooks/turn logic — those are middleware concerns.
 */
export class Conversation {
  messages: ModelMessage[] = [];
  readonly sessionId: string;

  private runner: Runner;
  private store?: SessionStore;

  constructor(options: ConversationOptions) {
    this.runner = options.runner;
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.store = options.store;
  }

  /**
   * Send a message through the composed runner pipeline.
   * Updates `this.messages` from `done` events automatically.
   */
  async *send(
    input: string | ModelMessage[],
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<SessionEvent> {
    for await (const event of this.runner(this.messages, input, options) as AsyncGenerator<SessionEvent>) {
      if (event.type === "done") {
        this.messages = event.messages;
      }
      yield event;
    }
  }

  /** Load messages from store. */
  async load(): Promise<boolean> {
    if (!this.store) return false;
    const loaded = await this.store.load(this.sessionId);
    if (loaded) {
      this.messages = loaded;
      return true;
    }
    return false;
  }

  /** Save messages to store. */
  async save(): Promise<void> {
    if (!this.store) return;
    await this.store.save(this.sessionId, this.messages);
  }

  /**
   * Convert a send call into an AI SDK 5 UIMessage stream.
   * Reuses the existing sessionEventsToUIStream function.
   */
  toUIMessageStream(
    input: string | ModelMessage[],
    options?: { signal?: AbortSignal },
  ): ReadableStream {
    return sessionEventsToUIStream(this.send(input, options), options);
  }

  /**
   * Convert a send call into an HTTP Response with SSE encoding.
   * Ready to return from any HTTP handler (Next.js, Express, etc.).
   */
  toResponse(
    input: string | ModelMessage[],
    init?: ResponseInit & { signal?: AbortSignal },
  ): Response {
    const { signal, ...responseInit } = init ?? {};
    return createUIMessageStreamResponse({
      stream: this.toUIMessageStream(input, { signal }),
      ...responseInit,
    });
  }
}
