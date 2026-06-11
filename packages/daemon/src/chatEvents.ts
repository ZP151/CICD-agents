import type { ChatEvent } from "@cicd-agent/core";

export type CanonicalChatEventType =
  | "session.started"
  | "text.delta"
  | "progress"
  | "tool.started"
  | "tool.output.delta"
  | "tool.completed"
  | "assistant.control"
  | "approval.required"
  | "approval.resolved"
  | "workflow.updated"
  | "final"
  | "error"
  | "cancelled";

export interface SseChatEvent {
  event: string;
  payload: unknown;
}

const CANONICAL_EVENT_BY_LEGACY: Partial<Record<ChatEvent["type"], CanonicalChatEventType>> = {
  assistant_delta: "text.delta",
  progress: "progress",
  tool_start: "tool.started",
  tool_output_delta: "tool.output.delta",
  tool_end: "tool.completed",
  assistant_control: "assistant.control",
  approval_required: "approval.required",
  approval_resolved: "approval.resolved",
  workflow_state: "workflow.updated",
  done: "final",
  error: "error",
  cancelled: "cancelled",
};

export function chatEventToSseEvents(event: ChatEvent): SseChatEvent[] {
  const out: SseChatEvent[] = [{ event: event.type, payload: event }];
  const canonical = CANONICAL_EVENT_BY_LEGACY[event.type];
  if (canonical && canonical !== event.type) {
    out.push({
      event: canonical,
      payload: {
        ...event,
        type: canonical,
        legacyType: event.type,
      },
    });
  }
  return out;
}

export function sessionStartedEvent(sessionId: string): SseChatEvent[] {
  return [
    { event: "session", payload: { sessionId } },
    { event: "session.started", payload: { type: "session.started", sessionId, legacyType: "session" } },
  ];
}
