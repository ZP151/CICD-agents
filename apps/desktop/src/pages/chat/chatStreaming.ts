import type { ChatEventPayload } from "../../api.js";

const LEGACY_STREAM_RENDER_EVENTS = new Set([
  "assistant_delta",
  "progress",
  "tool_start",
  "tool_output_delta",
  "tool.output.delta",
  "tool_end",
  "tool.completed",
  "message",
]);

export function shouldIgnoreLegacyStreamEvent(
  eventType: ChatEventPayload["type"] | string | undefined,
  uiChunkStreamAvailable: boolean,
): boolean {
  return uiChunkStreamAvailable && LEGACY_STREAM_RENDER_EVENTS.has(String(eventType ?? ""));
}
