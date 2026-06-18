import { type ChatEvent } from "@mergepilot/core";
import type { ActiveChatSessions } from "./chatActiveSessions.js";
import {
  markStoredApprovalProposalRunning,
  resolveStoredApprovalProposal,
} from "./chatApprovalProposals.js";
import {
  streamAndPersistConfirmedAction,
  type ConfirmedActionPersistenceAdapters,
} from "./chatConfirmedActions.js";
import { streamConfirmedActionOutcome } from "./chatConfirmedOutcome.js";
import {
  storedSessionProjectLinkId,
} from "./chatHistoryStore.js";
import {
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import { createChatRuntimeSetup, type ChatRuntimeSetup } from "./chatRuntimeSetup.js";
import { approvalIdFor } from "./chatWorkflowState.js";

export interface RunConfirmedChatActionArgs {
  active: ActiveChatSessions;
  sessionId: string;
  plannerAdapters: PlannerContinuationAdapters;
  persistenceAdapters: ConfirmedActionPersistenceAdapters;
}

export async function* runConfirmedChatAction(args: RunConfirmedChatActionArgs): AsyncGenerator<ChatEvent> {
  const { active, persistenceAdapters, plannerAdapters, sessionId } = args;
  const resolved = await resolveStoredApprovalProposal(sessionId);

  if (!resolved) {
    yield { type: "error", message: "No approval proposal for this session" };
    return;
  }
  const { storedSession, pending } = resolved;

  active.start(sessionId, storedSession.repoPath);

  let runtime: ChatRuntimeSetup | null = null;
  try {
    const workflowState = await markStoredApprovalProposalRunning(storedSession, pending);

    const session = active.get(sessionId)!;
    yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: true };
    yield { type: "workflow_state", state: workflowState };

    runtime = await createChatRuntimeSetup({
      repoPath: session.repoPath,
      llmConfig: storedSession.llmConfig,
      inlineProjectLink: storedSession.inlineProjectLink,
      projectLinkId: storedSessionProjectLinkId(storedSession),
    });
    const { llm, planner, actionExecutor } = runtime;

    const toolCallId = approvalIdFor(pending);
    const { ok, toolResult, summary } = yield* streamAndPersistConfirmedAction({
      sessionId,
      actionExecutor,
      pending,
      toolCallId,
      historyLabel: "confirmed & executed",
      adapters: persistenceAdapters,
    });

    yield* streamConfirmedActionOutcome({
      sessionId,
      repoPath: session.repoPath,
      pending,
      ok,
      toolResult,
      summary,
      llm,
      planner,
      inlineProjectLink: storedSession.inlineProjectLink,
      projectLinkId: storedSessionProjectLinkId(storedSession),
      adapters: plannerAdapters,
    });
  } finally {
    await runtime?.close();
    active.finish(sessionId);
  }
}
