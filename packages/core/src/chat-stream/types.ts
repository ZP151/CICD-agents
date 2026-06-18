import type { ChatEvent } from "../chatPlannerTypes.js";

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

export type ChatStreamSourceEvent = ChatEvent;
