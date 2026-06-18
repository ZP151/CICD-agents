import {
  type ChatEvent,
  type PendingToolAction,
  type ToolExecutor,
} from "@mergepilot/core";
import type { StoredBubble } from "./chatHistoryStore.js";
import {
  checkpointMetadataFromToolResult,
  streamConfirmedToolExecution,
} from "./chatToolExecution.js";

export interface ConfirmedActionPersistenceAdapters {
  appendBubble: (sessionId: string, bubble: StoredBubble) => Promise<void>;
  appendMessage: (sessionId: string, role: "assistant", content: string) => Promise<void>;
}

export interface PersistedConfirmedActionResult {
  ok: boolean;
  toolResult: unknown;
  summary: string;
}

export async function* streamAndPersistConfirmedAction(args: {
  sessionId: string;
  actionExecutor: ToolExecutor;
  pending: PendingToolAction;
  toolCallId: string;
  historyLabel: string;
  adapters: ConfirmedActionPersistenceAdapters;
}): AsyncGenerator<ChatEvent, PersistedConfirmedActionResult> {
  const { actionExecutor, adapters, historyLabel, pending, sessionId, toolCallId } = args;
  const execution = yield* streamConfirmedToolExecution({ actionExecutor, pending, toolCallId });
  const checkpointMetadata = checkpointMetadataFromToolResult(execution.result);

  await adapters.appendBubble(sessionId, {
    role: "tool",
    content: execution.summary,
    timestamp: now(),
    toolName: pending.tool,
    toolArgs: pending.args,
    toolOk: execution.ok,
    toolSummary: execution.summary,
    toolResult: execution.result,
    ...checkpointMetadata,
  });

  await adapters.appendMessage(
    sessionId,
    "assistant",
    `[${historyLabel}] ${pending.tool}(${JSON.stringify(pending.args)}): ${execution.summary}`,
  );

  return {
    ok: execution.ok,
    toolResult: execution.result,
    summary: execution.summary,
  };
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
