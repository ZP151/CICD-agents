import type { ChatEvent } from "./chatPlanner.js";

export type ChatUiChunk =
  | { type: "start" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "progress"; message: string }
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool-output-delta"; toolCallId: string; toolName: string; stream: "stdout" | "stderr"; delta: string }
  | { type: "tool-output-available"; toolCallId: string; toolName: string; output: unknown; summary: string }
  | { type: "tool-output-error"; toolCallId: string; toolName: string; errorText: string; summary: string }
  | { type: "approval-required"; approval: unknown }
  | { type: "approval-resolved"; approvalId: string; approved: boolean }
  | { type: "metadata-available"; metadata: unknown }
  | { type: "workflow-updated"; state: unknown }
  | { type: "finish"; finishReason: "stop" | "cancelled" | "error" }
  | { type: "error"; errorText: string };

export async function* chatEventsToUiChunks(events: AsyncIterable<ChatEvent>): AsyncGenerator<ChatUiChunk> {
  const adapter = new ChatUiChunkAdapter();
  yield* adapter.start();

  for await (const event of events) {
    yield* adapter.push(event);
  }
}

export class ChatUiChunkAdapter {
  private partCounter = 0;
  private textPartId: string | null = null;
  private readonly toolCallIds = new Map<string, string>();
  private started = false;

  *start(): Generator<ChatUiChunk> {
    if (this.started) return;
    this.started = true;
    yield { type: "start" };
  }

  *push(event: ChatEvent): Generator<ChatUiChunk> {
    yield* this.start();
    switch (event.type) {
      case "assistant_delta": {
        if (!event.delta) break;
        if (!this.textPartId) {
          this.textPartId = this.nextId();
          yield { type: "text-start", id: this.textPartId };
        }
        yield { type: "text-delta", id: this.textPartId, delta: event.delta };
        break;
      }

      case "message": {
        if (!event.text) break;
        if (!this.textPartId) {
          this.textPartId = this.nextId();
          yield { type: "text-start", id: this.textPartId };
        }
        yield { type: "text-delta", id: this.textPartId, delta: event.text };
        yield* this.closeText();
        break;
      }

      case "progress": {
        yield* this.closeText();
        yield { type: "progress", message: event.message };
        break;
      }

      case "tool_start": {
        yield* this.closeText();
        const toolCallId = event.toolCallId ?? nextToolCallId(event.name, event.args);
        this.toolCallIds.set(event.name, toolCallId);
        yield { type: "tool-input-start", toolCallId, toolName: event.name };
        yield { type: "tool-input-available", toolCallId, toolName: event.name, input: event.args };
        break;
      }

      case "tool_end": {
        yield* this.closeText();
        const toolCallId = event.toolCallId ?? this.toolCallIds.get(event.name) ?? nextToolCallId(event.name, {});
        this.toolCallIds.delete(event.name);
        if (event.ok) {
          yield {
            type: "tool-output-available",
            toolCallId,
            toolName: event.name,
            output: event.result,
            summary: event.summary,
          };
        } else {
          yield {
            type: "tool-output-error",
            toolCallId,
            toolName: event.name,
            errorText: errorTextFromToolResult(event.result),
            summary: event.summary,
          };
        }
        break;
      }

      case "tool_output_delta": {
        yield* this.closeText();
        const toolCallId = event.toolCallId ?? this.toolCallIds.get(event.name) ?? nextToolCallId(event.name, {});
        yield {
          type: "tool-output-delta",
          toolCallId,
          toolName: event.name,
          stream: event.stream,
          delta: event.delta,
        };
        break;
      }

      case "approval_required":
        yield* this.closeText();
        yield { type: "approval-required", approval: event.approval };
        break;

      case "approval_resolved":
        yield* this.closeText();
        yield { type: "approval-resolved", approvalId: event.approvalId, approved: event.approved };
        break;

      case "assistant_control":
        yield* this.closeText();
        yield { type: "metadata-available", metadata: event.control };
        break;

      case "workflow_state":
        yield { type: "workflow-updated", state: event.state };
        break;

      case "done":
        yield* this.closeText();
        yield { type: "finish", finishReason: "stop" };
        break;

      case "cancelled":
        yield* this.closeText();
        yield { type: "finish", finishReason: "cancelled" };
        break;

      case "error":
        yield* this.closeText();
        yield { type: "error", errorText: event.message };
        yield { type: "finish", finishReason: "error" };
        break;

      case "confirm_required":
      case "executing":
        yield* this.closeText();
        break;
    }
  }

  private nextId(): string {
    return `chat-${++this.partCounter}`;
  }

  private *closeText(): Generator<ChatUiChunk> {
    if (!this.textPartId) return;
    yield { type: "text-end", id: this.textPartId };
    this.textPartId = null;
  }
}

function nextToolCallId(name: string, args: Record<string, unknown>): string {
  return `tool-${name}-${hashShort(JSON.stringify(args ?? {}))}`;
}

function hashShort(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function errorTextFromToolResult(result: unknown): string {
  if (result && typeof result === "object" && "error" in result) {
    return summarizeKnownRuntimeError(String((result as { error?: unknown }).error ?? ""));
  }
  return summarizeKnownRuntimeError(typeof result === "string" ? result : JSON.stringify(result));
}

function summarizeKnownRuntimeError(text: string): string {
  if (/Could not locate the bindings file/i.test(text) || /better_sqlite3\.node/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not load its native SQLite binding.";
  }
  if (/schema\.sql/i.test(text) && /ENOENT|no such file|cannot find/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not find its database schema.";
  }
  return text.trim();
}
