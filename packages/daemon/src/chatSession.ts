import crypto from "node:crypto";
import {
  type ChatEvent,
  type ChatImageAttachment,
  type LLMClient,
  type ChatWorkflowState,
  type PendingToolAction,
  type TurnTimelineEvent,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "./llmSettings.js";
import {
  deleteStoredSession,
  listRecentSessions,
  loadSession,
  type ChatHistoryEntry,
  type InlineProjectLink,
  type StoredBubble,
  type StoredSession,
} from "./chatHistoryStore.js";
import { type ConfirmedActionPersistenceAdapters } from "./chatConfirmedActions.js";
import type { PlannerPersistenceAdapters } from "./chatPlannerPersistence.js";
import type { PlannerContinuationAdapters } from "./chatPlannerContinuation.js";
import { ActiveChatSessions } from "./chatActiveSessions.js";
import { createStoredApprovalProposal } from "./chatApprovalProposals.js";
import { runConfirmedChatAction } from "./chatConfirmActionRun.js";
import { runChatSessionTurn } from "./chatSessionRun.js";
import type { ChatRuntimeSetup } from "./chatRuntimeSetup.js";
import {
  approvalIdFor,
  buildWorkflowState,
  clearStoredApprovalProposal,
  storedApprovalProposal,
} from "./chatWorkflowState.js";
import {
  appendBubble,
  appendMessage,
  getBubbles,
  getHistory,
  getWorkflowState,
  listCheckpointActivity,
  saveNewSessionWithLocalFallback,
  saveSession,
  updateMetadata,
  type ChatCheckpointActivity,
} from "./chatSessionRecords.js";

export type { InlineLlmConfig } from "./llmSettings.js";
export type { ChatHistoryEntry, InlineProjectLink } from "./chatHistoryStore.js";
export { deriveWorkflowPendingAction, inferPendingAction } from "./chatPendingActions.js";
export { structuredDoneAfterConfirmedAction } from "./chatWorkflowState.js";
export {
  buildPrInsightContextBundle,
  buildPrInsightContextPrompt,
  extractPrInsightArtifactIdFromMessage,
  extractPullRequestIdFromMessage,
  formatPipelineFailureArtifactsForChat,
  formatPrInsightArtifactsForChat,
  formatValidationArtifactsForChat,
} from "./chatArtifactContext.js";
export {
  extractValidationFailureSignals,
  type ValidationFailureSignals,
} from "./validationFailureSignals.js";
export { checkpointMetadataFromToolResult } from "./chatToolExecution.js";
export { createChatToolExecutors } from "./chatToolRuntime.js";

// ─── ChatSessionManager ───────────────────────────────────────────────────────

export class ChatSessionManager {
  private readonly active = new ActiveChatSessions();

  createSession(repoPath: string, projectLinkId?: string): string {
    const id = `chat_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const createdAt = now();
    const session: StoredSession = {
      id,
      createdAt,
      updatedAt: createdAt,
      repoPath,
      projectLinkId,
      messages: [],
      bubbles: [],
    };
    saveNewSessionWithLocalFallback(session);
    this.active.start(id, repoPath);
    return id;
  }

  async getHistory(sessionId: string, limit = 40) {
    return getHistory(sessionId, limit);
  }

  async getBubbles(sessionId: string): Promise<StoredBubble[]> {
    return getBubbles(sessionId);
  }

  async getTurnTimelineEvents(sessionId: string): Promise<TurnTimelineEvent[]> {
    return (await loadSession(sessionId))?.timelineEvents ?? [];
  }

  async getWorkflowState(sessionId: string): Promise<ChatWorkflowState | undefined> {
    return getWorkflowState(sessionId);
  }

  async createApprovalProposal(args: {
    sessionId?: string;
    repoPath: string;
    projectLinkId?: string;
    inlineProjectLink?: InlineProjectLink;
    llmConfig?: InlineLlmConfig;
    proposal: PendingToolAction;
    currentStep: string;
    riskLevel?: string;
    explanation?: string;
    completedTools?: string[];
  }): Promise<{ sessionId: string; workflowState: ChatWorkflowState }> {
    const projectLinkId = args.projectLinkId;
    const sessionId = args.sessionId ?? this.createSession(args.repoPath, projectLinkId);
    return createStoredApprovalProposal({
      ...args,
      sessionId,
      projectLinkId,
    });
  }

  private async appendMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    return appendMessage(sessionId, role, content);
  }

  async appendBubble(sessionId: string, bubble: StoredBubble): Promise<void> {
    return appendBubble(sessionId, bubble);
  }

  async appendTurnTimelineEvent(sessionId: string, event: TurnTimelineEvent): Promise<void> {
    const session = await loadSession(sessionId);
    if (!session) return;
    const events = session.timelineEvents ?? [];
    const existing = events.findIndex((candidate) => (
      candidate.turnId === event.turnId && candidate.sequence === event.sequence
    ));
    const safeEvent = publicTimelineEvent(event);
    if (existing >= 0) {
      events[existing] = safeEvent;
    } else {
      events.push(safeEvent);
    }
    // Keep a bounded public replay log. This is intentionally separate from
    // tool persistence, which may retain internal results for agent use.
    session.timelineEvents = events.slice(-1_600);
    await saveSession(session);
  }

  async appendUserTurn(sessionId: string, content: string, repoPath: string): Promise<void> {
    await this.appendBubble(sessionId, { role: "user", content, timestamp: now(), repoPath });
    await this.appendMessage(sessionId, "user", content);
  }

  private plannerPersistenceAdapters(): PlannerPersistenceAdapters {
    return {
      appendBubble: this.appendBubble.bind(this),
      appendMessage: this.appendMessage.bind(this),
      getBubbles: this.getBubbles.bind(this),
      loadSession,
      saveSession,
    };
  }

  private plannerContinuationAdapters(): PlannerContinuationAdapters {
    return {
      ...this.plannerPersistenceAdapters(),
      getHistory: this.getHistory.bind(this),
    };
  }

  private confirmedActionPersistenceAdapters(): ConfirmedActionPersistenceAdapters {
    return {
      appendBubble: this.appendBubble.bind(this),
      appendMessage: this.appendMessage.bind(this),
    };
  }

  confirm(sessionId: string, confirmed: boolean): boolean {
    return this.active.confirm(sessionId, confirmed);
  }

  cancel(sessionId: string): void {
    this.active.cancel(sessionId);
  }

  async listRecent(limit = 30): Promise<ChatHistoryEntry[]> {
    return listRecentSessions(limit);
  }

  async updateMetadata(
    sessionId: string,
    patch: { title?: string | null; pinned?: boolean },
  ): Promise<ChatHistoryEntry | null> {
    return updateMetadata(sessionId, patch);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.cancel(sessionId);
    return deleteStoredSession(sessionId);
  }

  async listCheckpointActivity(limit = 50): Promise<ChatCheckpointActivity[]> {
    return listCheckpointActivity(limit);
  }

  async *run(
    sessionId: string,
    message: string,
    repoPath: string,
    projectLinkId?: string,
    llmConfig?: InlineLlmConfig,
    inlineProjectLink?: InlineProjectLink,
    imageAttachments: ChatImageAttachment[] = [],
    llm?: LLMClient,
    initialNarrative?: string,
    prewarmedRuntime?: Promise<ChatRuntimeSetup>,
  ): AsyncGenerator<ChatEvent> {
    yield* runChatSessionTurn({
      active: this.active,
      sessionId,
      message,
      repoPath,
      projectLinkId,
      llmConfig,
      inlineProjectLink,
      imageAttachments,
      llm,
      initialNarrative,
      prewarmedRuntime,
      adapters: this.plannerContinuationAdapters(),
    });
  }

  /**
   * Directly execute the session's stored approval proposal (invoked by the
   * dedicated /confirm-action endpoint — not via a chat message).
   * After execution, asks the LLM for the NEXT single workflow step only
   * (no re-running of read tools).
   */
  async *confirmAction(sessionId: string): AsyncGenerator<ChatEvent> {
    yield* runConfirmedChatAction({
      active: this.active,
      sessionId,
      plannerAdapters: this.plannerContinuationAdapters(),
      persistenceAdapters: this.confirmedActionPersistenceAdapters(),
    });
  }

  /**
   * Resolve a rejection without creating a second conversational turn.  The
   * browser resumes the original Timeline stream around these events.
   */
  async *declineAction(sessionId: string): AsyncGenerator<ChatEvent> {
    const storedSession = await loadSession(sessionId);
    const pending = storedSession ? storedApprovalProposal(storedSession) : undefined;
    if (!storedSession || !pending) {
      yield { type: "error", message: "No approval proposal for this session" };
      return;
    }

    clearStoredApprovalProposal(storedSession);
    const workflowState = buildWorkflowState([], undefined, "done", "cancelled");
    storedSession.workflowState = workflowState;
    await saveSession(storedSession);

    const response = "Approval declined. No action was run; you can send the next instruction when ready.";
    yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: false };
    yield { type: "workflow_state", state: workflowState };
    await appendMessage(sessionId, "assistant", response);
    await appendBubble(sessionId, { role: "assistant", content: response, timestamp: now() });
    yield {
      type: "done",
      result: {
        response,
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade: [],
        usedLlm: false,
      },
    };
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function publicTimelineEvent(event: TurnTimelineEvent): TurnTimelineEvent {
  const { result, ...safe } = event;
  // The final text is already independently present on turn.final.completed;
  // retaining generic result payloads risks persisting provider/tool internals.
  void result;
  return safe;
}
