import type { ChatArtifact, ChatSource } from "./chatConversationTypes.js";
import type { ChatApprovalPayload, ChatWorkflowState } from "./chatWorkflowTypes.js";

export type ChatEventType =
  | "session"
  | "session.started"
  | "turn.started"
  | "turn.narrative.delta"
  | "turn.waiting"
  | "turn.completed"
  | "turn.cancelled"
  | "turn.failed"
  | "turn.phase"
  | "turn.plan"
  | "turn.step"
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
  | "work_statement"
  | "tool_group_start"
  | "tool_group_end"
  | "final_delta"
  | "assistant_delta"
  | "text.delta"
  | "progress"
  | "tool_start"
  | "tool.started"
  | "tool_output_delta"
  | "tool.output.delta"
  | "tool_end"
  | "tool.completed"
  | "assistant_control"
  | "assistant.control"
  | "confirm_required"
  | "workflow_state"
  | "workflow.updated"
  | "approval_required"
  | "approval.required"
  | "approval_resolved"
  | "approval.resolved"
  | "executing"
  | "message"
  | "done"
  | "final"
  | "ui.chunk"
  | "error"
  | "cancelled";

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

export interface ChatEventPayload {
  type: ChatEventType;
  uiChunk?: ChatUiChunk;
  sessionId?: string;
  turnId?: string;
  sequence?: number;
  emittedAt?: number;
  elapsedMs?: number;
  status?: "completed" | "cancelled" | "failed";
  phase?: "working" | "final" | "starting" | "context" | "planning" | "executing" | "adjusting";
  stepId?: string;
  stepStatus?: "started" | "completed" | "blocked";
  planItems?: string[];
  /** Canonical transcript identity. These are intentionally separate from legacy tool ids. */
  blockId?: string;
  groupId?: string;
  commandId?: string;
  command?: string;
  durationMs?: number;
  replace?: boolean;
  finalText?: string;
  connector?: {
    kind: "built-in" | "mcp";
    id: string;
    label: string;
  };
  legacyType?: string;
  delta?: string;
  toolCallId?: string;
  name?: string;
  args?: Record<string, unknown>;
  stream?: "stdout" | "stderr";
  ok?: boolean;
  summary?: string;
  output?: string;
  toolResult?: unknown;
  riskLevel?: string;
  plan?: string;
  approval?: ChatApprovalPayload;
  workflow?: ChatWorkflowState;
  approvalId?: string;
  approved?: boolean;
  state?: ChatWorkflowState;
  text?: string;
  message?: string;
  result?: {
    response: string;
    streamedResponse?: string;
    finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
    riskLevel: string;
    actionsTaken: string[];
    suggestions: string[];
    sources?: ChatSource[];
    artifacts?: ChatArtifact[];
  };
}
