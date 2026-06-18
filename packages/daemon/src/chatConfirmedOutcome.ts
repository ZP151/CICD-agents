import {
  type ChatEvent,
  type ChatPlanner,
  type LLMClient,
  type PendingToolAction,
} from "@mergepilot/core";
import type { InlineProjectLink } from "./chatHistoryStore.js";
import {
  streamPlannerContinuation,
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import {
  buildWorkflowState,
  nextStructuredApprovalAfterConfirmedAction,
  setStoredApprovalProposal,
  structuredDoneAfterConfirmedAction,
} from "./chatWorkflowState.js";

export interface ConfirmedActionOutcomeArgs {
  sessionId: string;
  repoPath: string;
  pending: PendingToolAction;
  ok: boolean;
  toolResult: unknown;
  summary: string;
  llm: LLMClient;
  planner: ChatPlanner;
  inlineProjectLink?: InlineProjectLink;
  projectLinkId?: string;
  adapters: PlannerContinuationAdapters;
}

export async function* streamConfirmedActionOutcome(args: ConfirmedActionOutcomeArgs): AsyncGenerator<ChatEvent> {
  const {
    adapters,
    inlineProjectLink,
    llm,
    ok,
    pending,
    planner,
    repoPath,
    sessionId,
    summary,
    toolResult,
  } = args;

  const structuredNext = ok ? await nextStructuredApprovalAfterConfirmedAction(pending, repoPath) : undefined;
  if (structuredNext) {
    const sessionForNext = await adapters.loadSession(sessionId);
    if (sessionForNext) {
      setStoredApprovalProposal(sessionForNext, structuredNext.proposal);
      const workflowState = buildWorkflowState(
        sessionForNext.bubbles,
        structuredNext.proposal,
        "waiting_for_approval",
        structuredNext.currentStep,
        structuredNext.riskLevel,
        structuredNext.explanation,
      );
      sessionForNext.workflowState = workflowState;
      await adapters.saveSession(sessionForNext);
      yield { type: "workflow_state", state: workflowState };
      if (workflowState.pendingApproval) {
        yield { type: "approval_required", approval: workflowState.pendingApproval };
      }
      return;
    }
  }

  const structuredDone = ok ? structuredDoneAfterConfirmedAction(pending, toolResult) : undefined;
  if (structuredDone) {
    const sessionForDone = await adapters.loadSession(sessionId);
    if (sessionForDone) {
      setStoredApprovalProposal(sessionForDone, undefined);
      const workflowState = buildWorkflowState(
        sessionForDone.bubbles,
        undefined,
        "done",
        structuredDone.currentStep,
      );
      workflowState.workflowKind = structuredDone.workflowKind;
      workflowState.workflowPhase = structuredDone.workflowPhase;
      sessionForDone.workflowState = workflowState;
      await adapters.saveSession(sessionForDone);
      await adapters.appendBubble(sessionId, {
        role: "assistant",
        content: structuredDone.result.response,
        timestamp: now(),
        riskLevel: structuredDone.result.riskLevel,
        finalizationMode: structuredDone.result.finalizationMode,
        actionsTaken: structuredDone.result.actionsTaken,
        suggestions: structuredDone.result.suggestions,
        artifacts: structuredDone.result.artifacts,
      });
      yield { type: "workflow_state", state: workflowState };
      yield { type: "done", result: structuredDone.result };
      return;
    }
  }

  yield* streamPlannerContinuation({
    sessionId,
    message: continuationMessage(pending, ok, summary),
    repoPath,
    historyLimit: 22,
    llm,
    planner,
    inlineProjectLink,
    projectLinkId: args.projectLinkId,
    persistUserMessage: true,
    waitForConfirm: () => Promise.resolve(true),
    contextProgressMessage: "Refreshing project context",
    planningProgressMessage: "Planning next step",
    adapters,
  });
}

function continuationMessage(pending: PendingToolAction, ok: boolean, summary: string): string {
  const nextHint = pending.nextHint ?? "continue workflow";
  return ok
    ? `WORKFLOW STEP COMPLETED: ${pending.tool} executed successfully. Result: ${summary}. ` +
      `Next workflow step is: "${nextHint}". ` +
      `CRITICAL: Do NOT call git_status, git_diff, git_log, git_branch_list, git_current_branch, or git_remote again. ` +
      `The working tree state is already known. ` +
      `Proceed DIRECTLY to: ${nextHint}. ` +
      `If the next step requires user confirmation, propose it with approval_proposal in your JSON.`
    : `WORKFLOW STEP FAILED: ${pending.tool} failed with error: ${summary}. Explain what went wrong and propose a recovery action.`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
