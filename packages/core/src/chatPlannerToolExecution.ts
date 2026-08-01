import type { ChatToolCall } from "./llm.js";
import { publicToolOutput, summarizeToolResult, toolResultIndicatesSuccess } from "./chatPlannerControl.js";
import type { ToolExecutor } from "./tools/executor.js";
import type { ChatEvent, ChatPlannerResult } from "./chatPlannerTypes.js";

export interface PlannerToolExecutionResult {
  ok: boolean;
  toolResult: unknown;
  summary: string;
  output?: string;
}

export interface ToolFailureTracker {
  lastFailedTool: string;
  consecutiveFailCount: number;
}

export async function* executePlannerToolCall(
  executor: ToolExecutor,
  toolCall: ChatToolCall,
  args: Record<string, unknown>,
): AsyncGenerator<ChatEvent, PlannerToolExecutionResult> {
  yield { type: "tool_start", name: toolCall.name, args, toolCallId: toolCall.id };
  let toolResult: unknown;
  let ok = true;
  try {
    for await (const streamEvent of executor.callStream(toolCall.name, args)) {
      if (streamEvent.type === "output") {
        yield {
          type: "tool_output_delta",
          name: toolCall.name,
          stream: streamEvent.stream,
          delta: streamEvent.text,
          toolCallId: toolCall.id,
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
  const summary = summarizeToolResult(toolResult, ok);
  const output = publicToolOutput(toolResult, ok);
  yield {
    type: "tool_end",
    name: toolCall.name,
    ok,
    summary,
    output,
    result: toolResult,
    toolCallId: toolCall.id,
  };
  return { ok, toolResult, summary, output };
}

export function updateToolFailureTracker(
  tracker: ToolFailureTracker,
  toolName: string,
  ok: boolean,
): ToolFailureTracker {
  if (ok) {
    return { lastFailedTool: "", consecutiveFailCount: 0 };
  }
  if (toolName === tracker.lastFailedTool) {
    return {
      lastFailedTool: tracker.lastFailedTool,
      consecutiveFailCount: tracker.consecutiveFailCount + 1,
    };
  }
  return { lastFailedTool: toolName, consecutiveFailCount: 1 };
}

export function repeatedToolFailureResult(
  toolName: string,
  toolResult: unknown,
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
): ChatPlannerResult {
  const errMsg =
    typeof toolResult === "object" && toolResult !== null
      ? ((toolResult as Record<string, unknown>)["error"] as string | undefined) ??
        JSON.stringify(toolResult).slice(0, 200)
      : String(toolResult);
  return {
    response: `The \`${toolName}\` tool failed twice in a row. Last error:\n\n\`\`\`\n${errMsg}\n\`\`\`\n\nPlease check the above error and let me know how to proceed.`,
    riskLevel: "low",
    actionsTaken: toolCallsMade.map((t) => t.name),
    suggestions: [],
    toolCallsMade,
    usedLlm: true,
  };
}
