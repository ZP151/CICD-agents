import {
  type ChatEvent,
  type PendingToolAction,
  type ToolExecutor,
  publicToolOutput,
  summarizeToolResult,
  toolResultIndicatesSuccess,
} from "@mergepilot/core";

export interface ConfirmedToolExecutionResult {
  ok: boolean;
  result: unknown;
  summary: string;
  output?: string;
}

export interface ChatCheckpointApplyMetadata {
  targetCheckpointId?: string;
  applyMode?: string;
  restoredFiles?: string[];
}

export async function* streamConfirmedToolExecution(args: {
  actionExecutor: ToolExecutor;
  pending: PendingToolAction;
  toolCallId: string;
}): AsyncGenerator<ChatEvent, ConfirmedToolExecutionResult> {
  const { actionExecutor, pending, toolCallId } = args;
  // The approved action and its model-authored rationale already exist in
  // the active Turn. Do not insert a canned "I'll …" sentence at execution
  // time: it would masquerade as fresh agent reasoning and break the
  // transcript's evidence-first ordering.
  yield { type: "tool_group_start", groupId: toolCallId };
  yield { type: "turn_step", stepId: toolCallId, status: "started", label: pending.description || pending.tool };
  yield { type: "tool_start", name: pending.tool, args: pending.args, toolCallId };

  let toolResult: unknown;
  let ok = true;
  try {
    for await (const streamEvent of actionExecutor.callStream(pending.tool, pending.args)) {
      if (streamEvent.type === "output") {
        yield {
          type: "tool_output_delta",
          name: pending.tool,
          stream: streamEvent.stream,
          delta: streamEvent.text,
          toolCallId,
        };
      } else {
        toolResult = streamEvent.result;
      }
    }
  } catch (err) {
    ok = false;
    toolResult = { error: err instanceof Error ? err.message : String(err) };
  }

  ok = toolResultIndicatesSuccess(toolResult, ok);
  const output = publicToolOutput(toolResult, ok);
  // This summary crosses the SSE and persisted-compatibility boundaries.
  // Never derive it from raw JSON, which may include connector credentials.
  const summary = summarizeToolResult(toolResult, ok);
  yield { type: "tool_end", name: pending.tool, ok, summary, output, result: toolResult, toolCallId };
  yield {
    type: "turn_step",
    stepId: toolCallId,
    status: ok ? "completed" : "blocked",
    label: ok ? (pending.description || pending.tool) : `Could not complete: ${pending.description || pending.tool}`,
  };
  yield { type: "tool_group_end", groupId: toolCallId };
  return { ok, result: toolResult, summary, output };
}

export function checkpointMetadataFromToolResult(
  toolResult: unknown,
): { checkpointId: string; checkpointPath: string } | undefined {
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const result = toolResult as Record<string, unknown>;
  const metadata = result["execution_metadata"];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const beforeExecute = (metadata as Record<string, unknown>)["beforeExecute"];
  if (typeof beforeExecute !== "object" || beforeExecute === null) return undefined;
  const checkpointId = (beforeExecute as Record<string, unknown>)["checkpointId"];
  const checkpointPath = (beforeExecute as Record<string, unknown>)["checkpointPath"];
  if (typeof checkpointId !== "string" || !checkpointId) return undefined;
  if (typeof checkpointPath !== "string" || !checkpointPath) return undefined;
  return { checkpointId, checkpointPath };
}

export function checkpointApplyMetadataFromToolResult(
  toolName: string | undefined,
  toolResult: unknown,
): ChatCheckpointApplyMetadata | undefined {
  if (toolName !== "git_checkpoint_apply") return undefined;
  if (typeof toolResult !== "object" || toolResult === null) return undefined;
  const result = toolResult as Record<string, unknown>;
  const checkpointId = result["checkpointId"];
  if (typeof checkpointId !== "string" || !checkpointId) return undefined;
  const mode = result["mode"];
  const restoredFiles = result["restoredFiles"];
  return {
    targetCheckpointId: checkpointId,
    applyMode: typeof mode === "string" ? mode : undefined,
    restoredFiles: Array.isArray(restoredFiles)
      ? restoredFiles.filter((file): file is string => typeof file === "string")
      : undefined,
  };
}
