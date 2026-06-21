import {
  primaryToolCallPart,
  type ConversationToolCallPart,
} from "../../../chatBubbles.js";
import {
  ExecutionTimeline,
  type ExecutionTimelineItem,
} from "../../../components/conversation/ExecutionTimeline.js";
import { toolPartStateFromResult } from "../chatToolStreamState.js";
import type { Bubble } from "../chat.types.js";
import {
  toolCollapsedSummary,
  ToolOutputRenderer,
} from "../toolOutputRenderers.js";
import { PendingActionCard } from "./PendingActionCard.js";

export { PendingActionCard } from "./PendingActionCard.js";

interface ExecutionLogProps {
  tools: Bubble[];
  approval?: Bubble;
  onToggleTool: (id: string) => void;
  onConfirmApproval?: (id: string) => void;
  onCancelApproval?: (id: string, feedback?: string) => void;
}

/** Groups consecutive tool bubbles into a compact execution log. */
export function ExecutionLog({
  tools,
  approval,
  onToggleTool,
  onConfirmApproval,
  onCancelApproval,
}: ExecutionLogProps) {
  const approvalTool = approval?.kind === "pending_confirm" ? approval.pendingTool : undefined;
  const approvalTargetId = approvalTool
    ? (tools.find((tool) => toolNameFromBubble(tool) === approvalTool)?.id ?? tools.at(-1)?.id)
    : undefined;

  const items: ExecutionTimelineItem[] = tools.map((tool) => {
    const part = primaryToolCallPart(tool.parts);
    const output = part?.output ?? tool.toolResult;
    const toolName = toolNameFromBubble(tool);
    const state = part?.state ?? toolPartStateFromResult(tool.toolOk);
    const pending = part ? isToolPartRunning(part) : tool.toolOk === undefined;
    const summary = pending
      ? undefined
      : part?.summary ?? tool.toolSummary ?? toolCollapsedSummary(toolName, tool.toolOk, output);

    return {
      id: tool.id,
      toolName,
      state,
      ok: tool.toolOk,
      input: part?.input ?? tool.toolArgs,
      output,
      summary,
      open: tool.toolOpen,
      liveOutput: toolLiveOutputFromPart(part) || tool.toolLiveOutput,
      approval: approval?.kind === "pending_confirm" && tool.id === approvalTargetId
        ? {
            id: approval.id,
            toolName: approval.pendingTool,
            description: approval.pendingDescription,
            riskLevel: approval.riskLevel,
          }
        : undefined,
    };
  });

  return (
    <ExecutionTimeline
      items={items}
      onToggleItem={onToggleTool}
      renderOutput={(item) => <ToolOutputRenderer toolName={item.toolName} toolResult={item.output} />}
      renderApproval={(item) => {
        if (!approval || item.approval?.id !== approval.id) return null;
        return (
          <PendingActionCard
            bubble={approval}
            onConfirm={() => onConfirmApproval?.(approval.id)}
            onCancel={(feedback) => onCancelApproval?.(approval.id, feedback)}
          />
        );
      }}
    />
  );
}

function toolNameFromBubble(tool: Bubble): string | undefined {
  return primaryToolCallPart(tool.parts)?.toolName ?? tool.toolName;
}

function isToolPartRunning(part: ConversationToolCallPart | null): boolean {
  return part?.state === "input-streaming" || part?.state === "input-available" || part?.state === "running";
}

function toolLiveOutputFromPart(part: ConversationToolCallPart | null): string {
  if (!part?.output || typeof part.output !== "object") return "";
  const output = part.output as Record<string, unknown>;
  return [
    String(output["stdout"] ?? ""),
    String(output["stderr"] ?? ""),
  ].filter(Boolean).join("");
}
