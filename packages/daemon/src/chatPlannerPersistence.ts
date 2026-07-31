import {
  type ChatEvent,
  type ChatImageAttachment,
  type ChatMessage,
  type ChatPlanner,
  type ChatPlannerResult,
} from "@mergepilot/core";
import type { StoredBubble, StoredSession } from "./chatHistoryStore.js";
import {
  approvalProposalFromResult,
  buildWorkflowState,
  mergePlannerSources,
  setStoredApprovalProposal,
} from "./chatWorkflowState.js";
import { deriveWorkflowPendingAction } from "./chatPendingActions.js";
import { checkpointMetadataFromToolResult } from "./chatToolExecution.js";

export interface PlannerPersistenceAdapters {
  appendBubble: (sessionId: string, bubble: StoredBubble) => Promise<void>;
  appendMessage: (sessionId: string, role: "user" | "assistant", content: string) => Promise<void>;
  getBubbles: (sessionId: string) => Promise<StoredBubble[]>;
  loadSession: (sessionId: string) => Promise<StoredSession | null>;
  saveSession: (session: StoredSession) => Promise<void>;
}

export interface StreamPlannerAndPersistArgs {
  sessionId: string;
  message: string;
  history: ChatMessage[];
  repoPath: string;
  planner: ChatPlanner;
  waitForConfirm: () => Promise<boolean>;
  contextPrompt?: string;
  imageAttachments?: ChatImageAttachment[];
  /** Internal diagnostic context; deliberately never exposed as suggested replies. */
  contextNotes?: string[];
  contextSources?: ChatPlannerResult["sources"];
  adapters: PlannerPersistenceAdapters;
}

export async function* streamPlannerAndPersist(args: StreamPlannerAndPersistArgs): AsyncGenerator<ChatEvent> {
  const {
    adapters,
    contextPrompt,
    imageAttachments = [],
    contextSources = [],
    history,
    message,
    planner,
    repoPath,
    sessionId,
    waitForConfirm,
  } = args;
  let assistantReply = "";
  const pendingToolArgs = new Map<string, Record<string, unknown>>();

  for await (const event of planner.run(message, history, repoPath, waitForConfirm, contextPrompt, imageAttachments)) {
    if (event.type === "tool_start") {
      pendingToolArgs.set(event.name, event.args);
      yield event;
    } else if (event.type === "tool_end") {
      const toolArgs = pendingToolArgs.get(event.name);
      pendingToolArgs.delete(event.name);
      await adapters.appendBubble(sessionId, {
        role: "tool",
        content: event.summary,
        timestamp: now(),
        toolName: event.name,
        toolArgs,
        toolOk: event.ok,
        toolSummary: event.summary,
        toolResult: event.result,
        ...checkpointMetadataFromToolResult(event.result),
      });
      yield event;
    } else if (event.type === "done") {
      const bubbles = await adapters.getBubbles(sessionId);
      const enrichedResult = deriveWorkflowPendingAction(sessionId, event.result, bubbles);
      const approvalProposal = approvalProposalFromResult(enrichedResult);
      const storedBeforeDone = await adapters.loadSession(sessionId);
      const inheritedWorkflowMetadata = !approvalProposal && storedBeforeDone?.workflowState?.status === "running"
        ? {
            workflowKind: storedBeforeDone.workflowState.workflowKind,
            workflowPhase: doneWorkflowPhaseFromRunning(storedBeforeDone.workflowState.workflowPhase),
          }
        : {};
      const enrichedWithContext: ChatPlannerResult = {
        ...enrichedResult,
        sources: mergePlannerSources(enrichedResult.sources, contextSources),
      };
      const userFacingResult: ChatPlannerResult = {
        ...enrichedWithContext,
        approvalProposal: undefined,
      };
      const workflowState = buildWorkflowState(
        bubbles,
        approvalProposal,
        approvalProposal ? "waiting_for_approval" : "done",
        approvalProposal?.tool ?? "done",
        enrichedWithContext.riskLevel,
        enrichedWithContext.response,
        inheritedWorkflowMetadata,
      );

      assistantReply = enrichedWithContext.response;
      await adapters.appendBubble(sessionId, {
        role: "assistant",
        content: enrichedWithContext.response,
        timestamp: now(),
        riskLevel: enrichedWithContext.riskLevel,
        finalizationMode: enrichedWithContext.finalizationMode,
        actionsTaken: enrichedWithContext.actionsTaken,
        suggestions: enrichedWithContext.suggestions,
        sources: enrichedWithContext.sources,
        artifacts: enrichedWithContext.artifacts,
      });

      const storedForPending = await adapters.loadSession(sessionId);
      if (storedForPending) {
        setStoredApprovalProposal(storedForPending, approvalProposalFromResult(enrichedWithContext));
        storedForPending.workflowState = workflowState;
        await adapters.saveSession(storedForPending);
      }
      yield { type: "workflow_state", state: workflowState };
      if (workflowState.pendingApproval) {
        yield { type: "approval_required", approval: workflowState.pendingApproval };
      }
      yield { type: "done", result: userFacingResult };
    } else if (event.type === "error") {
      assistantReply = event.message;
      await adapters.appendBubble(sessionId, { role: "error", content: event.message, timestamp: now() });
      yield event;
    } else if (event.type === "cancelled") {
      assistantReply = "(cancelled)";
      await adapters.appendBubble(sessionId, { role: "system", content: "Action cancelled.", timestamp: now() });
      yield event;
    } else {
      yield event;
    }
  }

  if (assistantReply) {
    await adapters.appendMessage(sessionId, "assistant", assistantReply);
  }
}

function doneWorkflowPhaseFromRunning(phase: string | undefined): string | undefined {
  if (phase === "running_link_work_item") return "work_item_linked";
  if (!phase?.startsWith("running_")) return phase;
  return `${phase.slice("running_".length)}_done`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
