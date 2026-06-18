import {
  type ChatMessage,
  type ChatPlannerResult,
  type PendingToolAction,
} from "@mergepilot/core";
import type { StoredBubble } from "./chatHistoryStore.js";
import {
  buildPendingAction,
  inferWriteToolFromResponse,
} from "./chatPendingActionDerivers.js";
import {
  isProposalWithinUserScope,
  isToolWithinChatMessageScope,
} from "./chatPendingActionScope.js";
import { approvalProposalFromResult } from "./chatWorkflowState.js";

export function deriveWorkflowPendingAction(
  _sessionId: string,
  result: ChatPlannerResult,
  bubbles: StoredBubble[],
): ChatPlannerResult {
  const providedProposal = approvalProposalFromResult(result);
  if (providedProposal?.tool) {
    return isProposalWithinUserScope(providedProposal.tool, bubbles, providedProposal.args)
      ? result
      : { ...result, approvalProposal: undefined };
  }

  const response = result.response.toLowerCase();
  if (!isAskingConfirmation(response)) return result;

  const explicitTool = inferWriteToolFromResponse(response);
  if (!explicitTool) return result;

  const candidate = buildPendingAction(explicitTool, result.response, bubbles);
  if (isProposalWithinUserScope(candidate.tool, bubbles, candidate.args)) {
    return { ...result, approvalProposal: candidate };
  }
  return result;
}

export function inferPendingAction(messages: ChatMessage[]): PendingToolAction | undefined {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return undefined;
  const t = lastAssistant.content.toLowerCase();
  if (!isAskingConfirmation(t)) return undefined;

  const tool = inferWriteToolFromResponse(t);
  if (tool && !isToolWithinChatMessageScope(tool, messages)) return undefined;
  return tool ? buildPendingAction(tool, lastAssistant.content, []) : undefined;
}

function isAskingConfirmation(text: string): boolean {
  return text.includes("shall i") ||
    text.includes("should i") ||
    text.includes("do you want me to") ||
    text.includes("would you like") ||
    text.includes("proceed?") ||
    text.includes("shall i proceed") ||
    text.includes("ready to") ||
    text.includes("want me to");
}
