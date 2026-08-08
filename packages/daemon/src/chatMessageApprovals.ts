import {
  isConfirmationMessage,
  isDenialMessage,
  type ChatEvent,
  type ChatPlanner,
  type LLMClient,
  type ToolExecutor,
} from "@mergepilot/core";
import type { InlineProjectLink } from "./chatHistoryStore.js";
import { inferPendingAction } from "./chatPendingActions.js";
import { streamAndPersistConfirmedAction } from "./chatConfirmedActions.js";
import {
  streamPlannerContinuation,
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import {
  approvalIdFor,
  buildWorkflowState,
  clearStoredApprovalProposal,
  storedApprovalProposal,
} from "./chatWorkflowState.js";

export interface ChatMessageApprovalHandlingArgs {
  sessionId: string;
  message: string;
  repoPath: string;
  llm: LLMClient;
  planner: ChatPlanner;
  actionExecutor: ToolExecutor;
  waitForConfirm: () => Promise<boolean>;
  inlineProjectLink?: InlineProjectLink;
  projectLinkId?: string;
  adapters: PlannerContinuationAdapters;
}

export async function* handleChatMessageApproval(
  args: ChatMessageApprovalHandlingArgs,
): AsyncGenerator<ChatEvent, boolean> {
  const {
    actionExecutor,
    adapters,
    inlineProjectLink,
    llm,
    message,
    planner,
    repoPath,
    sessionId,
    waitForConfirm,
  } = args;
  const storedSession = await adapters.loadSession(sessionId);
  const storedProposal = storedSession ? storedApprovalProposal(storedSession) : undefined;
  const inferredProposal = isConfirmationMessage(message)
    ? inferPendingAction(storedSession?.messages ?? [])
    : undefined;
  const pending = storedProposal ?? inferredProposal;
  if (!pending) {
    return false;
  }

  if (isDenialMessage(message)) {
    if (storedSession) {
      clearStoredApprovalProposal(storedSession);
      await adapters.saveSession(storedSession);
    }

    yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: false };
    yield { type: "workflow_state", state: buildWorkflowState([], undefined, "done", "cancelled") };
    const doneEvent: ChatEvent = {
      type: "done",
      result: {
        response: "Got it — cancelled. Let me know when you're ready to continue.",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade: [],
        usedLlm: false,
      },
    };
    await adapters.appendMessage(sessionId, "assistant", doneEvent.result.response);
    await adapters.appendBubble(sessionId, {
      role: "assistant",
      content: doneEvent.result.response,
      timestamp: now(),
    });
    yield doneEvent;
    return true;
  }

  if (!isConfirmationMessage(message)) {
    if (storedSession) {
      clearStoredApprovalProposal(storedSession);
      await adapters.saveSession(storedSession);
    }
    yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: false };
    yield { type: "workflow_state", state: buildWorkflowState([], undefined, "running", "revising approval") };
    return false;
  }

  if (storedSession) {
    clearStoredApprovalProposal(storedSession);
    await adapters.saveSession(storedSession);
  }

  yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: true };
  yield { type: "workflow_state", state: buildWorkflowState([], undefined, "running", pending.tool) };
  const toolCallId = approvalIdFor(pending);
  const { ok, summary } = yield* streamAndPersistConfirmedAction({
    sessionId,
    actionExecutor,
    pending,
    toolCallId,
    historyLabel: "executed",
    adapters,
  });

  const continuationMsg = ok
    ? `${pending.tool} completed${pending.nextHint ? ` — next: ${pending.nextHint}` : ""}. Report result and continue the workflow.`
    : `${pending.tool} failed: ${summary}. What should we do?`;

  yield* streamPlannerContinuation({
    sessionId,
    message: continuationMsg,
    repoPath,
    historyLimit: 22,
    llm,
    planner,
    inlineProjectLink,
    projectLinkId: args.projectLinkId,
    persistUserMessage: true,
    waitForConfirm,
    contextProgressMessage: "Refreshing project context",
    planningProgressMessage: "Planning next step",
    adapters,
  });
  return true;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
