/**
 * Public, replayable event contract for one agent Turn.  It deliberately
 * carries only material suitable for a user transcript: no hidden reasoning,
 * raw stdout/stderr, exit codes, or provider payloads belong here.
 */
export type TurnConnector = {
  kind: "built-in" | "mcp";
  id: string;
  label: string;
};

export type TurnTimelineEventType =
  | "turn.started"
  /** OpenCode-style updatable public message part; legacy work.statement maps here. */
  | "turn.narrative.delta"
  /** A transient transport diagnostic, never persisted as agent prose. */
  | "turn.waiting"
  | "turn.work.statement"
  | "turn.tool_group.started"
  | "turn.tool_group.completed"
  | "turn.tool.started"
  | "turn.tool.completed"
  | "turn.approval.requested"
  | "turn.approval.resolved"
  | "turn.workflow.updated"
  | "turn.execution.completed"
  | "turn.final.delta"
  | "turn.final.completed"
  | "turn.finished"
  | "turn.failed"
  | "turn.cancelled";

export interface TurnTimelineEvent {
  type: TurnTimelineEventType;
  turnId: string;
  /** Browser-local correlation id used only to adopt an optimistic Turn. */
  clientTurnId?: string;
  /** Strictly increasing within one Turn; never reused. */
  sequence: number;
  emittedAt: number;
  phase?: "working" | "final";
  elapsedMs?: number;
  blockId?: string;
  groupId?: string;
  commandId?: string;
  connector?: TurnConnector;
  message?: string;
  delta?: string;
  finalText?: string;
  command?: string;
  name?: string;
  /** Public command arguments, never a tool result or streamed output. */
  args?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  /** Bounded, redacted output from the command; never a provider payload. */
  output?: string;
  durationMs?: number;
  approvalId?: string;
  approved?: boolean;
  approval?: unknown;
  /** Public workflow status used by approval and recovery UI, never provider data. */
  workflow?: unknown;
  status?: "completed" | "cancelled" | "failed";
  result?: unknown;
}

/**
 * The durable public projection of a Turn.  This deliberately mirrors the
 * message-part model used by event-driven agent runtimes: a part is updated
 * in place as deltas arrive and the exact same data can be replayed later.
 */
export type TurnPart =
  | { type: "narrative"; id: string; text: string }
  | { type: "action_group"; id: string; connector?: TurnConnector }
  | { type: "command"; id: string; groupId: string; command: string; status: "running" | "succeeded" | "failed" | "cancelled" }
  | { type: "approval"; id: string; status: "waiting" | "approved" | "rejected" }
  | { type: "delegation"; id: string; label: string; status: "working" | "completed" | "failed" }
  | { type: "final"; text: string };

export function isTurnTimelineEventType(value: string): value is TurnTimelineEventType {
  return new Set<TurnTimelineEventType>([
    "turn.started",
    "turn.narrative.delta",
    "turn.waiting",
    "turn.work.statement",
    "turn.tool_group.started",
    "turn.tool_group.completed",
    "turn.tool.started",
    "turn.tool.completed",
    "turn.approval.requested",
    "turn.approval.resolved",
    "turn.workflow.updated",
    "turn.execution.completed",
    "turn.final.delta",
    "turn.final.completed",
    "turn.finished",
    "turn.failed",
    "turn.cancelled",
  ]).has(value as TurnTimelineEventType);
}
